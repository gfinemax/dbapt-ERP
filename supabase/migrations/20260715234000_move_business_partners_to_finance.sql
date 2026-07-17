do $$
begin
  if to_regclass('finance.business_partners') is null and to_regclass('core.business_partners') is not null then
    alter table core.business_partners set schema finance;
  end if;
end $$;

grant select, insert, update on finance.business_partners to service_role;
alter table finance.business_partners enable row level security;
