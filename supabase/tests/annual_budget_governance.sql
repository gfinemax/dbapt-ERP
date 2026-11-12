begin;
do $$
declare
  org uuid:=gen_random_uuid();
  admin_id uuid:=gen_random_uuid();
  senior_id uuid:=gen_random_uuid();
  source_budget_id uuid:=gen_random_uuid();
  target_budget_id uuid:=gen_random_uuid();
  reserve_budget_id uuid:=gen_random_uuid();
  v_plan_id uuid;
  v_adjustment_id uuid;
  v_invalid_adjustment_id uuid;
  copied_item_count integer;
  annual_value numeric;
  monthly_value numeric;
begin
  insert into core.organizations(id,name,status) values(org,'Annual budget governance test','active');
  insert into auth.users(id) values(admin_id),(senior_id);
  insert into finance.reimbursement_members values
    (org,admin_id,'Budget admin',array['ADMIN'],true),
    (org,senior_id,'Senior approver',array['SENIOR'],true);
  insert into approval.budgets(
    id,organization_id,fiscal_year,budget_item,budget_code,plan_section,plan_item_label,
    approved_amount,monthly_amount,executed_amount,mapping_status
  ) values
    (source_budget_id,org,2026,'제세공과금>통신비','OPERATING-COMM','운영비','통신비',1200000,100000,0,'CONFIRMED'),
    (target_budget_id,org,2026,'일반운영비>사무용품비','OPERATING-SUPPLIES','운영비','사무용품비',2400000,200000,0,'CONFIRMED'),
    (reserve_budget_id,org,2026,'예비비','OPERATING-RESERVE','운영비','예비비',3600000,300000,0,'POLICY_REVIEW');

  select (approval.budget_governance_command(org,admin_id,'CREATE_PLAN',
    '{"fiscal_year":2027,"source_year":2026,"title":"2027 test plan"}'::jsonb)->>'id')::uuid into v_plan_id;
  select count(*) into copied_item_count from approval.budget_plan_version_items i where i.plan_id=v_plan_id;
  if copied_item_count<>3 then raise exception 'TEST: annual plan did not copy all budget items'; end if;
  perform approval.budget_governance_command(org,admin_id,'SUBMIT_PLAN',jsonb_build_object('plan_id',v_plan_id));
  perform approval.budget_governance_command(org,senior_id,'APPROVE_PLAN',jsonb_build_object(
    'plan_id',v_plan_id,'authority_reference','2027 regular meeting item 1','title','2027 approved plan'));
  if (select count(*) from approval.budgets where organization_id=org and fiscal_year=2027)<>3 then
    raise exception 'TEST: approved annual plan was not applied';
  end if;
  if (select status from approval.budget_plan_versions where id=v_plan_id)<>'ACTIVE' then
    raise exception 'TEST: approved annual plan is not active';
  end if;

  select (approval.budget_governance_command(org,admin_id,'CREATE_ADJUSTMENT',jsonb_build_object(
    'fiscal_year',2026,'adjustment_type','RESERVE_USE','source_budget_id',reserve_budget_id,
    'target_budget_id',source_budget_id,'effective_month','2026-01-01','amount',15740,
    'reason','January communications shortage','authority_reference','Internal budget rule article 10'))->>'id')::uuid
    into v_adjustment_id;
  perform approval.budget_governance_command(org,admin_id,'SUBMIT_ADJUSTMENT',jsonb_build_object('id',v_adjustment_id));
  perform approval.budget_governance_command(org,senior_id,'APPROVE_ADJUSTMENT',jsonb_build_object('id',v_adjustment_id,'decision_note','approved'));

  select approved_amount,monthly_amount into annual_value,monthly_value
  from jsonb_to_recordset(finance.reimbursement_budget_rows(org,'2026-01-01'))
    as x(id uuid,budget_item text,approved_amount numeric,monthly_amount numeric)
  where id=source_budget_id;
  if annual_value<>1215740 or monthly_value<>115740 then
    raise exception 'TEST: approved reserve use was not reflected in effective limits';
  end if;
  if approval.budget_adjustment_net(reserve_budget_id,null)<>-15740 then
    raise exception 'TEST: reserve source was not reduced';
  end if;

  select (approval.budget_governance_command(org,admin_id,'CREATE_ADJUSTMENT',jsonb_build_object(
      'fiscal_year',2026,'adjustment_type','RESERVE_USE','source_budget_id',source_budget_id,
      'target_budget_id',target_budget_id,'effective_month','2026-01-01','amount',1000,
      'reason','Invalid reserve source','authority_reference','test'))->>'id')::uuid into v_invalid_adjustment_id;
  perform approval.budget_governance_command(org,admin_id,'SUBMIT_ADJUSTMENT',jsonb_build_object('id',v_invalid_adjustment_id));
  begin
    perform approval.budget_governance_command(org,senior_id,'APPROVE_ADJUSTMENT',jsonb_build_object('id',v_invalid_adjustment_id));
    raise exception 'TEST: invalid reserve source was approved';
  exception when others then
    if sqlerrm like 'TEST:%' then raise; end if;
    if sqlerrm not like '%예비비 항목%' then raise; end if;
  end;
end $$;
rollback;
