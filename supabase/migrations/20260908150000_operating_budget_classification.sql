alter table approval.budgets
  add column if not exists budget_code text,
  add column if not exists plan_section text,
  add column if not exists plan_item_label text,
  add column if not exists mapping_status text not null default 'CONFIRMED',
  add column if not exists mapping_note text not null default '';

alter table approval.budgets drop constraint if exists budgets_mapping_status_check;
alter table approval.budgets add constraint budgets_mapping_status_check
  check (mapping_status in ('CONFIRMED','POLICY_REVIEW'));
create unique index if not exists budgets_organization_year_code_unique
  on approval.budgets(organization_id,fiscal_year,budget_code) where budget_code is not null;

with organizations as (
  select distinct organization_id from approval.budgets where fiscal_year=2026 and organization_id is not null
), missing(budget_item,approved_amount,monthly_amount,calculation_basis) as (
  values
    ('일반운영비>사무등록비',3600000::numeric,300000::numeric,'복사기·회선·문구류·기타'),
    ('일반운영비>사무용품비',2400000::numeric,200000::numeric,'각종 사무용품 구입비')
)
insert into approval.budgets(organization_id,fiscal_year,budget_item,approved_amount,executed_amount,monthly_amount,calculation_basis)
select o.organization_id,2026,m.budget_item,m.approved_amount,0,m.monthly_amount,m.calculation_basis
from organizations o cross join missing m
on conflict(organization_id,fiscal_year,budget_item) do nothing;

update approval.budgets set approved_amount=1200000,monthly_amount=100000,calculation_basis='복사용지·토너 및 각종 소모품 구입비',updated_at=now()
where fiscal_year=2026 and budget_item='일반운영비>소모품비';
update approval.budgets set approved_amount=1200000,monthly_amount=100000,calculation_basis='전화·팩스·인터넷 등',updated_at=now()
where fiscal_year=2026 and budget_item='제세공과금>통신비';

with metadata(budget_item,budget_code,plan_section,plan_item_label,mapping_status,mapping_note) as (values
 ('인건비>급여>조합장','LABOR-CHAIR','인건비','조합장 급여','CONFIRMED',''),
 ('인건비>급여>상근임원','LABOR-EXEC','인건비','사무장 급여','POLICY_REVIEW','사무장과 상근임원 역할 구분 확인 필요'),
 ('인건비>급여>직원','LABOR-STAFF','인건비','사무직원 급여','CONFIRMED',''),
 ('인건비>상여금','LABOR-BONUS','인건비','상여금','CONFIRMED','집행 시 대상별 분개'),
 ('인건비>기타인건비','LABOR-STATUTORY','인건비','보험료','POLICY_REVIEW','4대보험과 기타인건비의 범위 확인 필요'),
 ('인건비>퇴직금','LABOR-RETIREMENT','인건비','퇴직예치금','POLICY_REVIEW','퇴직예치와 실제 퇴직금의 회계 처리 확인 필요'),
 ('회의비>감사비','PROMOTION-AUDIT','사업추진비','감사비','POLICY_REVIEW','세부항목표에 없는 감사비 분류 확인 필요'),
 ('회의비>이사회비','PROMOTION-MEETING','사업추진비','회의비','CONFIRMED',''),
 ('업무추진비','PROMOTION-BUSINESS','사업추진비','업무추진비','CONFIRMED',''),
 ('일반운영비>지급임차료','OPERATING-RENT','운영비','임대료','CONFIRMED',''),
 ('일반운영비>도서인쇄비','OPERATING-PRINT','운영비','도서인쇄비','CONFIRMED',''),
 ('일반운영비>사무등록비','OPERATING-REGISTRATION','운영비','사무등록비','POLICY_REVIEW','복사기·회선·문구류 비용의 정확한 범위 확인 필요'),
 ('일반운영비>사무용품비','OPERATING-SUPPLIES','운영비','사무용품비','CONFIRMED',''),
 ('일반운영비>소모품비','OPERATING-CONSUMABLE','운영비','소모품비','CONFIRMED',''),
 ('복리후생비','OPERATING-WELFARE','운영비','복리후생비','CONFIRMED',''),
 ('일반운영비>수선비','OPERATING-REPAIR','운영비','수선비','CONFIRMED',''),
 ('기타운영비','OPERATING-ADVERTISING','운영비','광고비','POLICY_REVIEW','광고비를 기타운영비로 관리하는 기준 확인 필요'),
 ('제세공과금>수도광열비','OPERATING-UTILITY','운영비','수도광열비','CONFIRMED',''),
 ('제세공과금>통신비','OPERATING-COMM','운영비','통신비','CONFIRMED',''),
 ('제세공과금>여비교통비','OPERATING-TRAVEL','운영비','여비교통비','CONFIRMED',''),
 ('제세공과금>지급수수료','OPERATING-FEE','운영비','지급수수료','POLICY_REVIEW','법무사·운반·주민세 포함 범위 확인 필요'),
 ('예비비','OPERATING-RESERVE','운영비','예비비','POLICY_REVIEW','예비비 사용 승인 기준 확인 필요')
)
update approval.budgets b set budget_code=m.budget_code,plan_section=m.plan_section,plan_item_label=m.plan_item_label,
 mapping_status=m.mapping_status,mapping_note=m.mapping_note,updated_at=now()
from metadata m where b.fiscal_year=2026 and b.budget_item=m.budget_item;

create table if not exists finance.expense_detail_items(
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references approval.budgets(id) on delete restrict,
  code text not null,
  group_name text not null,
  name text not null,
  status text not null default 'CONFIRMED' check(status in ('CONFIRMED','POLICY_REVIEW')),
  policy_note text not null default '',
  quick_expense_eligible boolean not null default false,
  aliases text[] not null default '{}',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(budget_id,code)
);
create index if not exists expense_detail_items_budget_idx on finance.expense_detail_items(budget_id,sort_order);
alter table finance.expense_detail_items enable row level security;
revoke all on finance.expense_detail_items from anon,authenticated;
grant select,insert,update,delete on finance.expense_detail_items to service_role;

with details(code,group_name,name,budget_item,status,policy_note,aliases,quick_eligible,sort_order) as (values
 ('LABOR-CHAIR-SALARY','인건비','급여(조합장)','인건비>급여>조합장','CONFIRMED','','{조합장 급여}'::text[],false,10),
 ('LABOR-EXEC-SALARY','인건비','급여(상근임원)','인건비>급여>상근임원','POLICY_REVIEW','사무장과 상근임원 역할 구분 확인 필요','{사무장 급여,상근임원 급여}'::text[],false,20),
 ('LABOR-STAFF-SALARY','인건비','급여(직원)','인건비>급여>직원','CONFIRMED','','{직원 급여,사무직원 급여}'::text[],false,30),
 ('LABOR-BONUS','인건비','상여금','인건비>상여금','CONFIRMED','집행 시 지급 대상별 분개','{}'::text[],false,40),
 ('LABOR-RETIREMENT','인건비','퇴직금·퇴직예치','인건비>퇴직금','POLICY_REVIEW','퇴직예치와 실제 퇴직금의 회계 처리 확인 필요','{퇴직금,퇴직예치금}'::text[],false,50),
 ('LABOR-STATUTORY','인건비','법정부담금(4대보험)','인건비>기타인건비','POLICY_REVIEW','4대보험과 기타인건비의 범위 확인 필요','{보험료,4대보험}'::text[],false,60),
 ('WELFARE-MEAL','복리후생비','식대·간식비','복리후생비','CONFIRMED','','{식비,식대,간식}'::text[],false,100),
 ('WELFARE-GATHERING','복리후생비','회식비','복리후생비','CONFIRMED','','{}'::text[],false,110),
 ('WELFARE-HEALTH','복리후생비','건강검진비','복리후생비','CONFIRMED','','{}'::text[],false,120),
 ('WELFARE-CONDOLENCE','복리후생비','경조사비','복리후생비','CONFIRMED','','{}'::text[],false,130),
 ('WELFARE-CLOTHING','복리후생비','피복비','복리후생비','CONFIRMED','','{}'::text[],false,140),
 ('WELFARE-OTHER','복리후생비','기타 복리후생비','복리후생비','CONFIRMED','','{}'::text[],false,150),
 ('BUSINESS-PROMOTION','업무추진비','업무추진비','업무추진비','CONFIRMED','','{}'::text[],false,200),
 ('MEETING-BOARD','회의비','이사회·대의원회의비','회의비>이사회비','CONFIRMED','','{회의비,이사회비}'::text[],false,300),
 ('MEETING-AUDIT','회의비','감사비','회의비>감사비','POLICY_REVIEW','세부항목표에 없는 감사비 분류 확인 필요','{}'::text[],false,310),
 ('MEETING-OTHER','회의비','기타회의비','회의비>이사회비','CONFIRMED','','{}'::text[],false,320),
 ('MEETING-ELECTION','회의비','총회·선거관리비','회의비>이사회비','POLICY_REVIEW','별도 예산 편성 여부 확인 필요','{}'::text[],false,330),
 ('GENERAL-ASSET','일반운영비','비품·자산취득비','일반운영비>사무등록비','POLICY_REVIEW','사무등록비의 정확한 범위 확인 필요','{복사기,비품}'::text[],false,400),
 ('GENERAL-RENT','일반운영비','임차료·관리비','일반운영비>지급임차료','CONFIRMED','','{임대료,임차료}'::text[],false,410),
 ('GENERAL-PRINT','일반운영비','인쇄·우편비','일반운영비>도서인쇄비','CONFIRMED','','{인쇄,우편,도서인쇄비}'::text[],true,420),
 ('GENERAL-SUPPLIES','일반운영비','사무용품비','일반운영비>사무용품비','CONFIRMED','','{문구,사무용품}'::text[],true,430),
 ('GENERAL-CONSUMABLE','일반운영비','소모품·전산사용료','일반운영비>소모품비','CONFIRMED','','{소모품,복사용지,토너}'::text[],true,440),
 ('GENERAL-REPAIR','일반운영비','수선·유지비','일반운영비>수선비','CONFIRMED','','{수리,수선}'::text[],true,450),
 ('PUBLIC-COMM','공공요금·수수료','통신비','제세공과금>통신비','CONFIRMED','','{전화,팩스,인터넷}'::text[],true,500),
 ('PUBLIC-AI','공공요금·수수료','통신비(AI 업무보조 구독료)','제세공과금>통신비','POLICY_REVIEW','AI 구독료의 예산 분류 확인 필요','{AI 구독료}'::text[],false,510),
 ('PUBLIC-TRAVEL','공공요금·수수료','여비·교통·주차비','제세공과금>여비교통비','CONFIRMED','','{교통비,주유,주차}'::text[],true,520),
 ('PUBLIC-UTILITY','공공요금·수수료','전기·수도·관리비','제세공과금>수도광열비','CONFIRMED','','{전기,수도,가스}'::text[],true,530),
 ('PUBLIC-FEE','공공요금·수수료','송금·증명·전산수수료','제세공과금>지급수수료','CONFIRMED','법무사·운반·주민세는 별도 정책 확인','{송금수수료,발급수수료}'::text[],true,540),
 ('OTHER-OPERATING','기타운영비','기타운영비','기타운영비','POLICY_REVIEW','광고비 등 구체적 사용 목적 확인 필요','{광고,현수막,홍보}'::text[],false,600),
 ('RESERVE','예비비','예비비 사용','예비비','POLICY_REVIEW','예비비 사용 승인 근거 확인 필요','{}'::text[],false,700)
)
insert into finance.expense_detail_items(budget_id,code,group_name,name,status,policy_note,quick_expense_eligible,aliases,sort_order)
select b.id,d.code,d.group_name,d.name,d.status,d.policy_note,d.quick_eligible,d.aliases,d.sort_order
from approval.budgets b join details d on d.budget_item=b.budget_item where b.fiscal_year=2026
on conflict(budget_id,code) do update set group_name=excluded.group_name,name=excluded.name,status=excluded.status,
 policy_note=excluded.policy_note,quick_expense_eligible=excluded.quick_expense_eligible,aliases=excluded.aliases,sort_order=excluded.sort_order,updated_at=now();

alter table finance.quick_expense_records add column if not exists expense_detail_id uuid references finance.expense_detail_items(id) on delete restrict;
alter table finance.expense_resolutions add column if not exists expense_detail_id uuid references finance.expense_detail_items(id) on delete restrict;

create or replace function finance.guard_expense_detail_link() returns trigger language plpgsql security invoker set search_path='' as $$
declare detail finance.expense_detail_items%rowtype; budget approval.budgets%rowtype; expense_year integer; row_data jsonb; linked_budget_item text;
begin
 row_data:=to_jsonb(new);
 if new.expense_detail_id is null then return new; end if;
 select * into detail from finance.expense_detail_items where id=new.expense_detail_id and is_active;
 if not found then raise exception '활성 지출 세부항목을 찾을 수 없습니다.'; end if;
 select * into budget from approval.budgets where id=detail.budget_id;
 expense_year:=case when tg_table_name='quick_expense_records' then extract(year from (row_data->>'occurred_at')::timestamptz at time zone 'Asia/Seoul')::integer else extract(year from coalesce((row_data->>'actual_expense_date')::date,current_date))::integer end;
 linked_budget_item:=coalesce(row_data->>'budget_item',row_data->'resolution_data'->>'budgetItem','');
 if budget.organization_id<>new.organization_id or budget.fiscal_year<>expense_year then raise exception '지출 세부항목의 조직·연도가 지출과 일치하지 않습니다.'; end if;
 if linked_budget_item<>budget.budget_item then raise exception '지출 세부항목과 승인 예산항목이 일치하지 않습니다.'; end if;
 if tg_table_name='quick_expense_records' and (detail.status<>'CONFIRMED' or not detail.quick_expense_eligible) and new.record_status not in ('SOURCE_PENDING','CONVERTED') then new.record_status:='NEEDS_RESOLUTION'; end if;
 return new;
end $$;
drop trigger if exists expense_detail_link_guard on finance.quick_expense_records;
create trigger expense_detail_link_guard before insert or update of expense_detail_id,budget_item,occurred_at,record_status on finance.quick_expense_records for each row execute function finance.guard_expense_detail_link();
drop trigger if exists expense_detail_link_guard on finance.expense_resolutions;
create trigger expense_detail_link_guard before insert or update of expense_detail_id,actual_expense_date,resolution_data on finance.expense_resolutions for each row execute function finance.guard_expense_detail_link();
revoke all on function finance.guard_expense_detail_link() from public,anon,authenticated;
grant execute on function finance.guard_expense_detail_link() to service_role;

update finance.expense_compliance_settings s set quick_expense_allowed_budget_items=coalesce((
 select array_agg(b.budget_item order by b.budget_item) from approval.budgets b
 where b.organization_id=s.organization_id and b.fiscal_year=2026 and b.budget_item in (
  '일반운영비>도서인쇄비','일반운영비>사무용품비','일반운영비>소모품비','일반운영비>수선비',
  '제세공과금>수도광열비','제세공과금>여비교통비','제세공과금>통신비','제세공과금>지급수수료'
 )
),'{}');
