-- audit.audit_logs historically points actor_user_id at core.user_profiles,
-- while finance workflows authenticate against auth.users. Keep both identity
-- domains explicit instead of forcing an auth UUID through the legacy FK.
alter table audit.audit_logs
  add column if not exists auth_actor_id uuid references auth.users(id) on delete restrict;

create index if not exists audit_logs_auth_actor_id_idx
  on audit.audit_logs(auth_actor_id)
  where auth_actor_id is not null;

create or replace function audit.normalize_ledger_bank_auth_actor()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare
  actor_name text;
begin
  if new.actor_user_id is null then
    raise exception 'Ledger 감사로그 작성자를 확인할 수 없습니다.';
  end if;

  select m.display_name into actor_name
  from finance.reimbursement_members m
  where m.organization_id=new.organization_id
    and m.user_id=new.actor_user_id
    and m.active=true;

  if actor_name is null then
    raise exception 'Ledger 감사로그 작성자 권한을 확인할 수 없습니다.';
  end if;

  new.auth_actor_id:=new.actor_user_id;
  new.actor_user_id:=null;
  new.actor_label:=coalesce(new.actor_label,actor_name);
  return new;
end $$;

revoke all on function audit.normalize_ledger_bank_auth_actor() from public,anon,authenticated;
grant execute on function audit.normalize_ledger_bank_auth_actor() to service_role;

drop trigger if exists normalize_ledger_bank_auth_actor on audit.audit_logs;
create trigger normalize_ledger_bank_auth_actor
before insert on audit.audit_logs
for each row
when (new.action in ('LEDGER_BANK_BACKFILL_SYNC','LEDGER_BANK_ACCOUNT_MAP'))
execute function audit.normalize_ledger_bank_auth_actor();
