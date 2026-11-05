alter table finance.account_subjects
  drop constraint if exists account_subjects_source_check;
alter table finance.account_subjects
  add constraint account_subjects_source_check
  check (source in ('운영비 예산안','수지분석표','직접등록','Ledger 원장'));

create table finance.ledger_account_subject_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  source_system text not null default 'dbapt-ledger' check (source_system = 'dbapt-ledger'),
  ledger_category_id text not null,
  direction text not null check (direction in ('DEPOSIT','WITHDRAWAL')),
  category_group text not null,
  category_name text not null,
  account_subject_id uuid references finance.account_subjects(id) on delete restrict,
  sync_status text not null check (sync_status in ('MATCHED','CREATED','POLICY_REVIEW','TRANSFER')),
  sync_note text not null default '',
  synced_by uuid not null references auth.users(id) on delete restrict,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,source_system,ledger_category_id,direction)
);

create table finance.ledger_account_subject_link_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  link_id uuid not null references finance.ledger_account_subject_links(id) on delete restrict,
  action text not null check (action in ('CREATE','UPDATE')),
  actor_id uuid not null references auth.users(id) on delete restrict,
  actor_label text not null,
  before_data jsonb,
  after_data jsonb not null,
  created_at timestamptz not null default now()
);

create index ledger_account_subject_links_subject_idx
  on finance.ledger_account_subject_links(account_subject_id);
create index ledger_account_subject_links_synced_by_idx
  on finance.ledger_account_subject_links(synced_by);
create index ledger_account_subject_links_org_status_idx
  on finance.ledger_account_subject_links(organization_id,sync_status,ledger_category_id);
create index ledger_account_subject_link_audit_link_idx
  on finance.ledger_account_subject_link_audit_logs(link_id,created_at desc);
create index ledger_account_subject_link_audit_actor_idx
  on finance.ledger_account_subject_link_audit_logs(actor_id);
create index ledger_account_subject_link_audit_org_idx
  on finance.ledger_account_subject_link_audit_logs(organization_id,created_at desc);

alter table finance.ledger_account_subject_links enable row level security;
alter table finance.ledger_account_subject_link_audit_logs enable row level security;
revoke all on finance.ledger_account_subject_links,finance.ledger_account_subject_link_audit_logs
  from public,anon,authenticated;
grant select,insert,update on finance.ledger_account_subject_links to service_role;
grant select,insert on finance.ledger_account_subject_link_audit_logs to service_role;
create policy ledger_account_subject_links_server on finance.ledger_account_subject_links
  for all to service_role using (true) with check (true);
create policy ledger_account_subject_link_audit_server on finance.ledger_account_subject_link_audit_logs
  for all to service_role using (true) with check (true);

create or replace function finance.sync_ledger_account_subjects(
  p_org uuid,
  p_actor uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  actor finance.reimbursement_members;
  item jsonb;
  category_id_value text;
  category_group_value text;
  category_name_value text;
  direction_value text;
  generated_code text;
  subject_type_value text;
  normal_balance_value text;
  business_category_value text;
  sync_status_value text;
  sync_note_value text;
  subject_row finance.account_subjects;
  link_before finance.ledger_account_subject_links;
  link_saved finance.ledger_account_subject_links;
  exact_count integer;
  saved_count integer:=0;
  created_count integer:=0;
  matched_count integer:=0;
  review_count integer:=0;
  transfer_count integer:=0;
  had_link boolean;
begin
  actor:=finance.workflow_actor(p_org,p_actor,'ADMIN');
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception '동기화할 Ledger 계정항목을 한 개 이상 선택해주세요.';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    category_id_value:=trim(coalesce(item->>'ledger_category_id',''));
    category_group_value:=trim(coalesce(item->>'category_group',''));
    category_name_value:=trim(coalesce(item->>'category_name',''));
    direction_value:=trim(coalesce(item->>'direction',''));
    if category_id_value='' or category_name_value='' or direction_value not in ('DEPOSIT','WITHDRAWAL') then
      raise exception 'Ledger category_id, 항목명과 입출금 방향을 확인해주세요.';
    end if;

    select * into link_before from finance.ledger_account_subject_links l
    where l.organization_id=p_org and l.source_system='dbapt-ledger'
      and l.ledger_category_id=category_id_value and l.direction=direction_value;
    had_link:=found;
    subject_row:=null;
    sync_note_value:='';
    if category_name_value='확인필요' or category_group_value in ('미분류','확인필요') then
      sync_status_value:='POLICY_REVIEW';
      sync_note_value:='미분류 원본은 ERP 계정과목으로 자동 등록하지 않음';
      review_count:=review_count+1;
    elsif category_name_value='계좌간이체' or category_group_value='대체' then
      sync_status_value:='TRANSFER';
      sync_note_value:='계좌간이체는 계정과목 대신 대체 규칙으로 관리';
      transfer_count:=transfer_count+1;
    else
      if direction_value='DEPOSIT' then
        if category_name_value like '%차입%' or category_name_value like '%가수금%' then
          subject_type_value:='부채';
          normal_balance_value:='대변';
          business_category_value:='미분류';
        else
          subject_type_value:='수입';
          normal_balance_value:='대변';
          business_category_value:='수입';
        end if;
      elsif category_name_value like '%차입금상환%' then
        subject_type_value:='부채';
        normal_balance_value:='대변';
        business_category_value:='미분류';
      else
        subject_type_value:='지출';
        normal_balance_value:='차변';
        business_category_value:=case
          when category_group_value like '%인건비%' then '인건비'
          when category_group_value like '%운영비%' then '운영비'
          when category_name_value like '%토지매입%' then '토지비'
          when category_name_value like '%법무%' or category_name_value like '%소송%' then '등기·법무비'
          when category_name_value like '%총회%' or category_name_value like '%업무추진%' then '사업추진비'
          when category_name_value like '%신탁%' or category_name_value like '%용역%' then '기타개발비'
          else '미분류'
        end;
      end if;

      if had_link and link_before.account_subject_id is not null then
        select * into subject_row from finance.account_subjects a
        where a.id=link_before.account_subject_id and a.organization_id=p_org and a.is_active;
      end if;
      if subject_row.id is not null then
        sync_status_value:=case when link_before.sync_status in ('CREATED','MATCHED')
          then link_before.sync_status else 'MATCHED' end;
        sync_note_value:='기존 Ledger category_id와 ERP 계정과목 UUID 연결을 유지';
        matched_count:=matched_count+1;
      else
        select count(*) into exact_count
        from finance.account_subjects a
        where a.organization_id=p_org and a.is_active
          and lower(trim(a.name))=lower(category_name_value)
          and ((direction_value='DEPOSIT' and a.subject_type<>'지출')
            or (direction_value='WITHDRAWAL' and a.subject_type<>'수입'));
        if exact_count=1 then
          select * into subject_row
          from finance.account_subjects a
          where a.organization_id=p_org and a.is_active
            and lower(trim(a.name))=lower(category_name_value)
            and ((direction_value='DEPOSIT' and a.subject_type<>'지출')
              or (direction_value='WITHDRAWAL' and a.subject_type<>'수입'))
          limit 1;
          sync_status_value:='MATCHED';
          sync_note_value:='동일한 이름과 회계 방향의 기존 ERP 계정과목에 연결';
          matched_count:=matched_count+1;
        elsif exact_count>1 then
          sync_status_value:='POLICY_REVIEW';
          sync_note_value:='동일한 이름의 ERP 계정과목이 여러 개라 자동 연결하지 않음';
          review_count:=review_count+1;
        else
          generated_code:='LEDGER-'||regexp_replace(upper(category_id_value),'[^A-Z0-9]+','-','g')
            ||case when direction_value='DEPOSIT' then '-IN' else '-OUT' end;
          select * into subject_row from finance.account_subjects a
          where a.organization_id=p_org and a.code=generated_code;
          if found then
            sync_status_value:='POLICY_REVIEW';
            sync_note_value:='Ledger 동기화 코드가 기존 비활성 또는 다른 계정과목과 충돌함';
            subject_row:=null;
            review_count:=review_count+1;
          else
            insert into finance.account_subjects(
              organization_id,code,name,subject_type,normal_balance,business_category,source,
              aliases,description,sort_order,is_active
            ) values (
              p_org,generated_code,category_name_value,subject_type_value,normal_balance_value,
              business_category_value,'Ledger 원장',array[category_group_value],
              'dbapt-ledger category_id '||category_id_value||' 동기화',
              2000+coalesce(nullif(regexp_replace(category_id_value,'[^0-9]+','','g'),'')::integer,999),true
            ) returning * into subject_row;
            insert into finance.account_subject_audit_logs(
              organization_id,account_subject_id,action,actor_id,actor_label,after_data
            ) values (
              p_org,subject_row.id,'CREATE',p_actor,actor.display_name,
              to_jsonb(subject_row)||jsonb_build_object(
                'ledger_category_id',category_id_value,'ledger_category_group',category_group_value,
                'ledger_direction',direction_value
              )
            );
            sync_status_value:='CREATED';
            sync_note_value:='Ledger 분류에서 새 ERP 계정과목을 등록';
            created_count:=created_count+1;
          end if;
        end if;
      end if;
    end if;

    insert into finance.ledger_account_subject_links(
      organization_id,source_system,ledger_category_id,direction,category_group,category_name,
      account_subject_id,sync_status,sync_note,synced_by,synced_at,updated_at
    ) values (
      p_org,'dbapt-ledger',category_id_value,direction_value,category_group_value,category_name_value,
      subject_row.id,sync_status_value,sync_note_value,p_actor,now(),now()
    )
    on conflict (organization_id,source_system,ledger_category_id,direction) do update set
      category_group=excluded.category_group,
      category_name=excluded.category_name,
      account_subject_id=excluded.account_subject_id,
      sync_status=excluded.sync_status,
      sync_note=excluded.sync_note,
      synced_by=excluded.synced_by,
      synced_at=excluded.synced_at,
      updated_at=excluded.updated_at
    returning * into link_saved;
    insert into finance.ledger_account_subject_link_audit_logs(
      organization_id,link_id,action,actor_id,actor_label,before_data,after_data
    ) values (
      p_org,link_saved.id,case when had_link then 'UPDATE' else 'CREATE' end,
      p_actor,actor.display_name,case when had_link then to_jsonb(link_before) end,to_jsonb(link_saved)
    );
    saved_count:=saved_count+1;
  end loop;

  insert into audit.audit_logs(
    organization_id,actor_user_id,action,entity_schema,entity_table,entity_id,after_data
  ) values (
    p_org,p_actor,'LEDGER_ACCOUNT_SUBJECTS_SYNC','finance','ledger_account_subject_links',p_actor::text,
    jsonb_build_object(
      'saved_count',saved_count,'created_count',created_count,'matched_count',matched_count,
      'review_count',review_count,'transfer_count',transfer_count
    )
  );
  return jsonb_build_object(
    'saved_count',saved_count,'created_count',created_count,'matched_count',matched_count,
    'review_count',review_count,'transfer_count',transfer_count
  );
end
$$;

revoke all on function finance.sync_ledger_account_subjects(uuid,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function finance.sync_ledger_account_subjects(uuid,uuid,jsonb) to service_role;
