alter table finance.bank_accounts
  add column if not exists account_purpose text not null default '',
  add column if not exists opened_at date,
  add column if not exists closed_at date,
  add column if not exists verified_at date,
  add column if not exists current_balance numeric(16,0);

update finance.bank_accounts
set opened_at=(created_at at time zone 'Asia/Seoul')::date
where opened_at is null;

alter table finance.bank_accounts
  alter column opened_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='bank_accounts_open_close_order_check'
      and conrelid='finance.bank_accounts'::regclass
  ) then
    alter table finance.bank_accounts
      add constraint bank_accounts_open_close_order_check
      check (closed_at is null or closed_at >= opened_at);
  end if;
end $$;

with target_org as (
  select id
  from core.organizations
  where name='대방동 지역주택조합'
  order by created_at
  limit 1
), source(account_name,bank_name,account_no,account_type,account_purpose,opened_at,closed_at,verified_at,current_balance) as (
  values
    ('안동연(대방동지주택)','우리은행','1006-901-293047','운영계좌','조합 운영비','2008-07-09'::date,null,'2026-08-25'::date,1479::numeric),
    ('안동연(대방동지주택)','하나은행','56291000762005','운영계좌','조합 운영비','2012-05-14'::date,null,null,169087::numeric),
    ('조합 여직원명의','신한은행','110-365-172420','운영계좌','조합 운영비','2012-05-29'::date,null,null,1737852::numeric),
    ('대방동지역주택조합','기업은행','071-114261-04-017','운영계좌','조합 운영비','2021-02-26'::date,null,'2026-08-24'::date,71::numeric),
    ('무궁화신탁(업무대행비)','우리은행','1005-403-950770','신탁계좌','신탁관리','2020-04-29'::date,null,null,304785952::numeric),
    ('무궁화신탁(분담금)','우리은행','1005-503-950527','신탁계좌','신탁관리','2020-05-02'::date,null,null,99260064::numeric),
    ('대방동지역주택조합','국민은행','029301-04-179045','운영계좌','조합 운영비','2012-11-02'::date,null,'2026-08-25'::date,5475::numeric),
    ('대방동지역주택조합','신협은행','131-022-540467','운영계좌','조합 운영비','2024-12-04'::date,null,'2026-09-10'::date,1224905::numeric),
    ('대방동지역주택조합','마을금고','9002-2094-4050-7','운영계좌','조합 운영비','2026-08-14'::date,null,null,null),
    ('KB부동산신탁(분담금)','KB은행','349401-04-368831','신탁계좌','신탁관리','2026-09-11'::date,null,null,null),
    ('KB부동산신탁(신청금)','KB은행','349401-04-368844','신탁계좌','신탁관리','2026-09-11'::date,null,null,null)
)
insert into finance.bank_accounts(
  organization_id,account_name,bank_name,account_no,account_type,account_purpose,
  opened_at,closed_at,verified_at,current_balance,usage_status,sync_status,unmatched_count
)
select o.id,s.account_name,s.bank_name,s.account_no,s.account_type,s.account_purpose,
       s.opened_at,s.closed_at::date,s.verified_at,s.current_balance,'사용','확인필요',0
from source s cross join target_org o
on conflict (account_no) where deleted_at is null do update set
  organization_id=excluded.organization_id,
  account_name=excluded.account_name,
  bank_name=excluded.bank_name,
  account_type=excluded.account_type,
  account_purpose=excluded.account_purpose,
  opened_at=excluded.opened_at,
  closed_at=excluded.closed_at,
  verified_at=excluded.verified_at,
  current_balance=excluded.current_balance,
  usage_status='사용',
  updated_at=now();
