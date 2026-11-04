create table finance.financial_report_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  report_type text not null check(report_type in ('MONTHLY_CASH','QUARTERLY_PERFORMANCE')),
  period_start date not null, period_end date not null,
  version integer not null check(version>0),
  status text not null default 'DRAFT' check(status in ('DRAFT','REVIEW','APPROVED','PUBLISHED','SUPERSEDED')),
  source_hash text not null check(source_hash ~ '^[0-9a-f]{32}$'),
  snapshot jsonb not null, reason text not null,
  generated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(organization_id,report_type,period_start,version)
);
create index financial_report_runs_period_idx on finance.financial_report_runs(organization_id,period_start desc,report_type,version desc);
alter table finance.financial_report_runs enable row level security;
revoke all on finance.financial_report_runs from public,anon,authenticated;
grant select,insert on finance.financial_report_runs to service_role;
create policy financial_report_runs_server on finance.financial_report_runs for all to service_role using(true) with check(true);

create function finance.financial_report_run_immutable() returns trigger
language plpgsql security invoker set search_path='' as $$ begin
  raise exception '확정 시점의 보고서 스냅샷은 수정하거나 삭제할 수 없습니다.';
end $$;
create trigger financial_report_run_immutable before update or delete on finance.financial_report_runs
for each row execute function finance.financial_report_run_immutable();

create function finance.financial_report_live(p_org uuid,p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare
  m finance.reimbursement_members; latest_date date; month_start date; month_end date;
  quarter_start date; quarter_end date; opening numeric; month_in numeric; month_out numeric;
  quarter_in numeric; quarter_out numeric; closing numeric; categories jsonb; details jsonb;
  unclassified integer; assessment_total numeric; receipt_total numeric; active_members integer;
begin
  m:=finance.workflow_actor(p_org,p_actor);
  if not (m.permissions && array['ADMIN','CLOSE','PAY','APPROVE','SENIOR']) then raise exception '보고서 조회 권한이 필요합니다.'; end if;
  select coalesce(max(b.transacted_at::date),current_date) into latest_date
    from finance.bank_transactions b where b.organization_id=p_org and b.deleted_at is null;
  month_start:=date_trunc('month',latest_date)::date;
  month_end:=(month_start+interval '1 month'-interval '1 day')::date;
  quarter_start:=date_trunc('quarter',latest_date)::date;
  quarter_end:=(quarter_start+interval '3 months'-interval '1 day')::date;
  select coalesce(sum(b.deposit_amount-b.withdrawal_amount),0) into opening from finance.bank_transactions b
    where b.organization_id=p_org and b.deleted_at is null and b.transacted_at<month_start;
  select coalesce(sum(b.deposit_amount),0),coalesce(sum(b.withdrawal_amount),0),
    count(*) filter(where coalesce(b.classification_status,'UNREVIEWED')<>'CONFIRMED')
    into month_in,month_out,unclassified from finance.bank_transactions b
    where b.organization_id=p_org and b.deleted_at is null and b.transacted_at>=month_start and b.transacted_at<month_end+1;
  closing:=opening+month_in-month_out;
  select coalesce(sum(b.deposit_amount),0),coalesce(sum(b.withdrawal_amount),0) into quarter_in,quarter_out
    from finance.bank_transactions b where b.organization_id=p_org and b.deleted_at is null
      and b.transacted_at>=quarter_start and b.transacted_at<quarter_end+1;
  select coalesce(jsonb_agg(row_data order by row_data->>'category'),'[]'::jsonb) into categories from (
    select jsonb_build_object('category',coalesce(s.name,b.recommended_account_subject_name,b.uploaded_account_title,'미분류'),
      'deposit_amount',sum(b.deposit_amount),'withdrawal_amount',sum(b.withdrawal_amount),'transaction_count',count(*)) row_data
    from finance.bank_transactions b left join finance.account_subjects s on s.id=b.confirmed_account_subject_id
    where b.organization_id=p_org and b.deleted_at is null and b.transacted_at>=month_start and b.transacted_at<month_end+1
    group by coalesce(s.name,b.recommended_account_subject_name,b.uploaded_account_title,'미분류')) grouped;
  select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'date',b.transacted_at,'description',b.description,
    'counterparty',b.counterparty,'deposit_amount',b.deposit_amount,'withdrawal_amount',b.withdrawal_amount,
    'category',coalesce(s.name,b.recommended_account_subject_name,b.uploaded_account_title,'미분류'),
    'classification_status',coalesce(b.classification_status,'UNREVIEWED')) order by b.transacted_at,b.id),'[]'::jsonb)
    into details from finance.bank_transactions b left join finance.account_subjects s on s.id=b.confirmed_account_subject_id
    where b.organization_id=p_org and b.deleted_at is null and b.transacted_at>=month_start and b.transacted_at<month_end+1;
  select coalesce(sum(a.assessed_amount),0),count(distinct a.external_member_id) filter(where a.status='ACTIVE')
    into assessment_total,active_members from finance.collection_assessments a where a.organization_id=p_org;
  select coalesce(sum(x.amount),0) into receipt_total from finance.collection_receipt_allocations x
    left join finance.collection_receipt_reversals r on r.allocation_id=x.id
    where x.organization_id=p_org and r.id is null;
  return jsonb_build_object(
    'generated_at',clock_timestamp(),'source','ERP bank transactions and collection ledger',
    'monthly',jsonb_build_object('period_start',month_start,'period_end',month_end,'opening_balance',opening,
      'deposit_total',month_in,'withdrawal_total',month_out,'closing_balance',closing,
      'unclassified_count',unclassified,'categories',categories,'transactions',details),
    'quarterly',jsonb_build_object('period_start',quarter_start,'period_end',quarter_end,
      'deposit_total',quarter_in,'withdrawal_total',quarter_out,'closing_balance',
      (select coalesce(sum(b.deposit_amount-b.withdrawal_amount),0) from finance.bank_transactions b
       where b.organization_id=p_org and b.deleted_at is null and b.transacted_at<quarter_end+1),
      'assessment_total',assessment_total,'receipt_total',receipt_total,'active_member_count',active_members));
end $$;

create function finance.generate_financial_reports(p_org uuid,p_actor uuid,p_reason text,p_report_types text[] default array['MONTHLY_CASH','QUARTERLY_PERFORMANCE']) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare live jsonb; report_kind text; v_period_start date; v_period_end date; part jsonb;
  source_hash text; latest finance.financial_report_runs; next_version integer; generated jsonb:='[]'::jsonb;
begin
  if coalesce(length(trim(p_reason)),0) not between 1 and 500 then raise exception '보고서 생성 사유가 필요합니다.'; end if;
  live:=finance.financial_report_live(p_org,p_actor);
  if p_report_types is null or cardinality(p_report_types)=0 or not (p_report_types<@array['MONTHLY_CASH','QUARTERLY_PERFORMANCE']::text[]) then
    raise exception '보고서 유형을 확인해주세요.';
  end if;
  foreach report_kind in array p_report_types loop
    part:=case when report_kind='MONTHLY_CASH' then live->'monthly' else live->'quarterly' end;
    v_period_start:=(part->>'period_start')::date; v_period_end:=(part->>'period_end')::date;
    source_hash:=md5(part::text);
    select * into latest from finance.financial_report_runs r where r.organization_id=p_org and r.report_type=report_kind
      and r.period_start=v_period_start order by r.version desc limit 1;
    if latest.id is not null and latest.source_hash=source_hash then
      generated:=generated||jsonb_build_array(jsonb_build_object('id',latest.id,'report_type',report_kind,'version',latest.version,'created',false));
    else
      next_version:=coalesce(latest.version,0)+1;
      insert into finance.financial_report_runs(organization_id,report_type,period_start,period_end,version,source_hash,snapshot,reason,generated_by)
      values(p_org,report_kind,v_period_start,v_period_end,next_version,source_hash,part,trim(p_reason),p_actor) returning * into latest;
      generated:=generated||jsonb_build_array(jsonb_build_object('id',latest.id,'report_type',report_kind,'version',latest.version,'created',true));
    end if;
  end loop;
  return jsonb_build_object('reports',generated,'live',live);
end $$;

create function finance.financial_report_history(p_org uuid,p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare m finance.reimbursement_members;
begin
  m:=finance.workflow_actor(p_org,p_actor);
  if not (m.permissions && array['ADMIN','CLOSE','PAY','APPROVE','SENIOR']) then raise exception '보고서 조회 권한이 필요합니다.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'report_type',r.report_type,'period_start',r.period_start,
    'period_end',r.period_end,'version',r.version,'status',r.status,'reason',r.reason,'created_at',r.created_at)
    order by r.period_start desc,r.report_type,r.version desc) from finance.financial_report_runs r where r.organization_id=p_org),'[]'::jsonb);
end $$;

revoke all on function finance.financial_report_live(uuid,uuid),finance.generate_financial_reports(uuid,uuid,text,text[]),finance.financial_report_history(uuid,uuid) from public,anon,authenticated;
grant execute on function finance.financial_report_live(uuid,uuid),finance.generate_financial_reports(uuid,uuid,text,text[]),finance.financial_report_history(uuid,uuid) to service_role;
grant execute on function finance.financial_report_run_immutable() to service_role;
