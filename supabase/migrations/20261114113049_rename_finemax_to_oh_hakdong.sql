-- 파인맥스는 별도 사용자가 아니라 오학동 계정에 잘못 남은 과거 표시명이다.
-- UUID와 불변 감사 원본은 유지하고 현재 업무 문서의 표시명만 정정한다.
do $$
declare
  member finance.reimbursement_members;
  resolution record;
  affected_count bigint;
begin
  select * into member
  from finance.reimbursement_members
  where active and display_name = '오학동'
  order by organization_id, user_id
  limit 1;

  select
    (select count(*) from finance.expense_resolutions where author_label like '%파인맥스%' or resolution_data::text like '%파인맥스%') +
    (select count(*) from finance.fixed_certificate_assignment_batches where created_by_label like '%파인맥스%')
  into affected_count;

  if member.user_id is not null then
    insert into finance.workflow_events(
      organization_id, actor_id, action, reason, before_data, after_data
    ) values (
      member.organization_id,
      member.user_id,
      'DISPLAY_NAME_CORRECTION',
      '동일 사용자 오학동의 과거 잘못된 표시명 파인맥스를 정정함',
      jsonb_build_object('display_name', '파인맥스', 'mutable_document_rows', affected_count),
      jsonb_build_object('display_name', '오학동', 'immutable_audit_history_preserved', true)
    );
  end if;

  for resolution in
    select id, organization_id
    from finance.expense_resolutions
    where author_label like '%파인맥스%' or resolution_data::text like '%파인맥스%'
    for update
  loop
    perform set_config('finance.legacy_expense_command_org', resolution.organization_id::text, true);
    perform set_config('finance.legacy_expense_command_id', resolution.id, true);
    update finance.expense_resolutions
    set author_label = replace(author_label, '파인맥스', '오학동'),
        resolution_data = replace(resolution_data::text, '파인맥스', '오학동')::jsonb,
        updated_at = now()
    where id = resolution.id and organization_id = resolution.organization_id;
  end loop;
  perform set_config('finance.legacy_expense_command_org', '', true);
  perform set_config('finance.legacy_expense_command_id', '', true);
end $$;

update finance.fixed_certificate_assignment_batches
set created_by_label = replace(created_by_label, '파인맥스', '오학동')
where created_by_label like '%파인맥스%';
