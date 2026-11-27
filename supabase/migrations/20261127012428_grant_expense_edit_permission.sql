-- Keep broad administration separate from the ability to maintain mutable
-- expense resolutions for the organization.
alter table finance.reimbursement_members
  drop constraint if exists reimbursement_members_permissions_check;

alter table finance.reimbursement_members
  add constraint reimbursement_members_permissions_check
  check (permissions <@ array['ADMIN','APPROVE','SENIOR','CLOSE','PAY','EXPENSE_EDIT']::text[]);

do $migration$
declare
  routine record;
  definition text;
  patched_count integer := 0;
  save_guard constant text :=
    'if exists_row and not is_admin and binding.author_user_id is distinct from p_actor then raise exception ''작성자 연결 또는 관리자 권한이 필요합니다.''; end if;';
  save_guard_with_editor constant text :=
    'if exists_row and not (is_admin or ''EXPENSE_EDIT''=any(m.permissions)) and binding.author_user_id is distinct from p_actor then raise exception ''작성자 연결, 지출결의 수정 권한 또는 관리자 권한이 필요합니다.''; end if;';
  fact_guard constant text :=
    'elsif p_command in (''FACT_SAVE'',''FACT_DELETE'') then' || chr(10) ||
    '  if not is_admin and binding.author_user_id is distinct from p_actor then raise exception ''작성자 연결 또는 관리자 권한이 필요합니다.''; end if;';
  fact_guard_with_editor constant text :=
    'elsif p_command in (''FACT_SAVE'',''FACT_DELETE'') then' || chr(10) ||
    '  if not (is_admin or ''EXPENSE_EDIT''=any(m.permissions)) and binding.author_user_id is distinct from p_actor then raise exception ''작성자 연결, 지출결의 수정 권한 또는 관리자 권한이 필요합니다.''; end if;';
begin
  for routine in
    select p.oid
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='finance'
      and p.proname like 'legacy_expense_command%'
      and p.pronargs=7
  loop
    definition := pg_catalog.pg_get_functiondef(routine.oid);
    if pg_catalog.strpos(definition, save_guard)>0 then
      definition := pg_catalog.replace(definition, save_guard, save_guard_with_editor);
      if pg_catalog.strpos(definition, fact_guard)>0 then
        definition := pg_catalog.replace(definition, fact_guard, fact_guard_with_editor);
      end if;
      execute definition;
      patched_count := patched_count + 1;
    end if;
  end loop;
  if patched_count<>1 then
    raise exception '지출결의 저장 권한 함수 1개를 예상했으나 %개를 확인했습니다.', patched_count;
  end if;
end
$migration$;

-- This is an explicit, narrow operational grant. It does not confer member,
-- policy, approval-line, or approved-document correction administration.
update finance.reimbursement_members
set permissions = array_append(permissions,'EXPENSE_EDIT')
where btrim(display_name)='장현제'
  and active
  and not ('EXPENSE_EDIT'=any(permissions));

notify pgrst, 'reload schema';
