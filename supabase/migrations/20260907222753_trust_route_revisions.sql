-- Route edits share the source revision so two editors cannot silently overwrite
-- one another using the same expected revision. Existing rows are not rewritten.
create function finance.workflow_route_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.route is distinct from old.route or new.contract_version_id is distinct from old.contract_version_id then
  perform pg_advisory_xact_lock(hashtextextended(old.organization_id::text,739));
  new.revision:=old.revision+1;
  update finance.workflow_trust_items set needs_review=true where transaction_id=old.id and status not in ('PENDING','REJECTED','WITHDRAWN');
 end if;
 return new;
end $$;
create trigger workflow_route_revision before update on finance.workflow_transactions
for each row execute function finance.workflow_route_revision();
revoke all on function finance.workflow_route_revision() from public,anon,authenticated;
grant execute on function finance.workflow_route_revision() to service_role;
