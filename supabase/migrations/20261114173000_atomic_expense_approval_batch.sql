-- Apply several expense approval transitions in one database transaction.
-- The existing single-document command remains the authority for identity,
-- optimistic locking, approval-line, payment, bank-link and audit validation.
create or replace function finance.legacy_expense_approval_batch(
  p_org uuid,
  p_actor uuid,
  p_items jsonb,
  p_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  item_id text;
  item_result jsonb;
  results jsonb := '[]'::jsonb;
  item_count integer;
begin
  perform finance.workflow_actor(p_org, p_actor);

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception '일괄 결재 항목 형식을 확인해주세요.';
  end if;
  item_count := jsonb_array_length(p_items);
  if item_count < 1 or item_count > 50 then
    raise exception '일괄 결재는 1건 이상 50건 이하만 처리할 수 있습니다.';
  end if;
  if coalesce(trim(p_key), '') = '' or length(p_key) > 120 then
    raise exception '일괄 결재 처리키를 확인해주세요.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) value
    group by value->>'id'
    having coalesce(value->>'id', '') = '' or count(*) > 1
  ) then
    raise exception '중복되거나 비어 있는 지출결의 항목이 있습니다.';
  end if;

  -- A shared organization lock makes the prevalidated set all-or-nothing.
  perform pg_advisory_xact_lock(hashtextextended(p_org::text, 739));

  for item in select value from jsonb_array_elements(p_items)
  loop
    item_id := item->>'id';
    if jsonb_typeof(item->'payload') is distinct from 'object'
      or not (item ? 'expected') then
      raise exception '일괄 결재 원본과 전환 내용을 확인해주세요: %', item_id;
    end if;

    item_result := finance.legacy_expense_command(
      p_org,
      p_actor,
      'APPROVAL',
      item_id,
      item->'expected',
      item->'payload',
      p_key || ':' || item_id
    );
    results := results || jsonb_build_array(item_result);
  end loop;

  return jsonb_build_object(
    'batchKey', p_key,
    'count', item_count,
    'results', results
  );
end;
$$;

revoke all on function finance.legacy_expense_approval_batch(uuid, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function finance.legacy_expense_approval_batch(uuid, uuid, jsonb, text)
  to service_role;
