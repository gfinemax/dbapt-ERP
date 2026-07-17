insert into core.organizations(name, status)
select '대방동 지역주택조합', 'active'
where not exists (
  select 1 from core.organizations where name = '대방동 지역주택조합'
);

update finance.expense_resolutions
set organization_id = (
  select id from core.organizations where name = '대방동 지역주택조합' order by created_at limit 1
)
where organization_id is null;

update finance.bank_transactions
set organization_id = (
  select id from core.organizations where name = '대방동 지역주택조합' order by created_at limit 1
)
where organization_id is null;

update finance.vouchers
set organization_id = (
  select id from core.organizations where name = '대방동 지역주택조합' order by created_at limit 1
)
where organization_id is null;

insert into finance.expense_compliance_settings(organization_id)
select id from core.organizations where name = '대방동 지역주택조합' order by created_at limit 1
on conflict (organization_id) do nothing;
