-- 외부납입 인정의 자료 출처와 회계 처리를 분리한다.
-- 부과 원본 ID가 없는 건은 임의 부과를 만들지 않고 조합원 단위 원장으로 보존한다.
alter table finance.collection_external_recognitions
  add column source_kind text not null default 'other',
  add column accounting_treatment text not null default 'pending_review',
  add column actual_fund_amount numeric(16,0) not null default 0,
  add column loss_amount numeric(16,0) not null default 0;

alter table finance.collection_external_recognitions
  drop constraint if exists collection_external_recognitions_linkage_status_check;
alter table finance.collection_external_recognitions
  add constraint collection_external_recognitions_linkage_status_check check(linkage_status in (
    'LINKED','MEMBER_LEVEL','UNLINKED','ASSESSMENT_MISSING','MEMBER_MISMATCH','EXCEEDS_ASSESSMENT'
  )),
  add constraint collection_external_recognitions_source_kind_check check(source_kind in (
    'application_certificate','dongil_fixed_certificate','dongil_other','trust_account','other'
  )),
  add constraint collection_external_recognitions_accounting_treatment_check check(accounting_treatment in (
    'confirmed_loss','trust_receipt','pending_review'
  )),
  add constraint collection_external_recognitions_actual_fund_amount_check check(actual_fund_amount>=0),
  add constraint collection_external_recognitions_loss_amount_check check(loss_amount>=0),
  add constraint collection_external_recognitions_accounting_amount_check check(
    actual_fund_amount+loss_amount<=recognized_amount
  );

select set_config('finance.ledger_external_recognition_sync_context','on',true);
update finance.collection_external_recognitions set
  source_kind=case
    when source_payload->>'source_kind' in ('application_certificate','dongil_fixed_certificate','dongil_other','trust_account','other')
      then source_payload->>'source_kind'
    when source_payload->>'source_record_type'='agency_receipt' then 'dongil_fixed_certificate'
    when source_payload#>>'{recognition,source_type}'='trust_company' then 'trust_account'
    when source_payload#>>'{recognition,source_type}'='agency' then 'dongil_other'
    when source_payload#>>'{recognition,source_type}'='certificate' then 'application_certificate'
    else 'other'
  end,
  accounting_treatment=case
    when source_payload->>'accounting_treatment' in ('confirmed_loss','trust_receipt','pending_review')
      then source_payload->>'accounting_treatment'
    when source_payload#>>'{recognition,source_type}'='trust_company' then 'trust_receipt'
    else 'confirmed_loss'
  end,
  actual_fund_amount=case
    when status='CANCELLED' then 0
    when coalesce(source_payload->>'accounting_treatment','')='trust_receipt'
      or source_payload#>>'{recognition,source_type}'='trust_company' then recognized_amount
    else 0
  end,
  loss_amount=case
    when status='CANCELLED' then 0
    when coalesce(source_payload->>'accounting_treatment','')='trust_receipt'
      or source_payload#>>'{recognition,source_type}'='trust_company' then 0
    else recognized_amount
  end,
  linkage_status=case
    when status='ACTIVE' and source_assessment_id is null and external_member_id is not null then 'MEMBER_LEVEL'
    else linkage_status
  end,
  linkage_issue_detail=case
    when status='ACTIVE' and source_assessment_id is null and external_member_id is not null
      then '특정 부과를 새로 만들지 않고 조합원 전체 납부 인정 원장으로 반영했습니다.'
    else linkage_issue_detail
  end;

create or replace function finance.classify_ledger_external_recognition()
returns trigger language plpgsql security invoker set search_path='' as $$
declare payload_kind text; payload_treatment text; amount_value numeric;
begin
  payload_kind:=nullif(trim(coalesce(new.source_payload->>'source_kind','')),'');
  new.source_kind:=case
    when payload_kind in ('application_certificate','dongil_fixed_certificate','dongil_other','trust_account','other')
      then payload_kind
    when new.source_payload->>'source_record_type'='agency_receipt' then 'dongil_fixed_certificate'
    when new.source_payload#>>'{recognition,source_type}'='trust_company' then 'trust_account'
    when new.source_payload#>>'{recognition,source_type}'='agency' then 'dongil_other'
    when new.source_payload#>>'{recognition,source_type}'='certificate' then 'application_certificate'
    else 'other'
  end;
  payload_treatment:=nullif(trim(coalesce(new.source_payload->>'accounting_treatment','')),'');
  new.accounting_treatment:=case
    when payload_treatment in ('confirmed_loss','trust_receipt','pending_review') then payload_treatment
    when new.source_kind='trust_account' then 'trust_receipt'
    else 'confirmed_loss'
  end;
  amount_value:=case when new.status='ACTIVE' then new.recognized_amount else 0 end;
  new.actual_fund_amount:=case when new.accounting_treatment='trust_receipt' then amount_value else 0 end;
  new.loss_amount:=case when new.accounting_treatment='confirmed_loss' then amount_value else 0 end;
  if new.status='ACTIVE' and new.source_assessment_id is null and new.external_member_id is not null then
    new.assessment_id:=null;
    new.linkage_status:='MEMBER_LEVEL';
    new.linkage_issue_detail:='특정 부과를 새로 만들지 않고 조합원 전체 납부 인정 원장으로 반영했습니다.';
  end if;
  return new;
end $$;

drop trigger if exists classify_ledger_external_recognition on finance.collection_external_recognitions;
create trigger classify_ledger_external_recognition
before insert or update of source_payload,status,recognized_amount,source_assessment_id,external_member_id
on finance.collection_external_recognitions for each row
execute function finance.classify_ledger_external_recognition();

create or replace function finance.resolve_member_level_external_recognition_issue()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.issue_code='UNKNOWN_ASSESSMENT'
     and nullif(trim(coalesce(new.payload->>'source_assessment_id','')),'') is null
     and nullif(trim(coalesce(new.payload->>'external_member_id','')),'') is not null then
    new.resolved_at:=clock_timestamp();
    new.issue_detail:='부과 원본 없이 조합원 단위 외부납입 원장으로 정상 반영했습니다.';
  end if;
  return new;
end $$;

drop trigger if exists resolve_member_level_external_recognition_issue
  on finance.ledger_external_recognition_sync_issues;
create trigger resolve_member_level_external_recognition_issue
before insert or update on finance.ledger_external_recognition_sync_issues
for each row execute function finance.resolve_member_level_external_recognition_issue();

update finance.ledger_external_recognition_sync_issues set
  resolved_at=coalesce(resolved_at,clock_timestamp()),
  issue_detail='부과 원본 없이 조합원 단위 외부납입 원장으로 정상 반영했습니다.',
  updated_at=clock_timestamp()
where issue_code='UNKNOWN_ASSESSMENT'
  and nullif(trim(coalesce(payload->>'source_assessment_id','')),'') is null
  and nullif(trim(coalesce(payload->>'external_member_id','')),'') is not null;

create index collection_external_recognitions_accounting_idx
  on finance.collection_external_recognitions(
    organization_id,accounting_treatment,status,source_updated_at desc
  );

create or replace function finance.collection_ledger_read(p_org uuid,p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare base jsonb; assessments jsonb; recognitions jsonb;
begin
  base:=finance.collection_ledger_read_legacy(p_org,p_actor);
  select coalesce(jsonb_agg(a.item||jsonb_build_object(
    'cash_allocated_amount',coalesce((a.item->>'allocated_amount')::numeric,0),
    'external_recognized_amount',coalesce((select sum(x.recognized_amount)
      from finance.collection_external_recognitions x where x.organization_id=p_org
        and x.assessment_id=(a.item->>'id')::uuid and x.status='ACTIVE'),0),
    'satisfied_amount',coalesce((a.item->>'allocated_amount')::numeric,0)+coalesce((select sum(x.recognized_amount)
      from finance.collection_external_recognitions x where x.organization_id=p_org
        and x.assessment_id=(a.item->>'id')::uuid and x.status='ACTIVE'),0)
  )),'[]'::jsonb) into assessments from jsonb_array_elements(base->'assessments') a(item);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,'assessment_id',x.assessment_id,'source_recognition_id',x.source_recognition_id,
    'source_root_recognition_id',x.source_root_recognition_id,
    'source_current_recognition_id',x.source_current_recognition_id,
    'source_assessment_id',x.source_assessment_id,'external_member_id',x.external_member_id,
    'member_name_snapshot',x.source_payload->>'member_name_snapshot',
    'recognized_on',x.recognized_on,'recognized_amount',x.recognized_amount,
    'claimed_amount',x.source_payload->>'claimed_amount',
    'recognition_type',x.recognition_type,'reason',x.reason,'status',x.status,
    'source_kind',x.source_kind,'accounting_treatment',x.accounting_treatment,
    'actual_fund_amount',x.actual_fund_amount,'loss_amount',x.loss_amount,
    'linkage_status',x.linkage_status,'linkage_issue_detail',x.linkage_issue_detail,
    'governance_status',x.source_payload#>>'{recognition,governance_status}',
    'sync_reason',x.source_payload->>'sync_reason','source_version',x.source_version,
    'source_updated_at',x.source_updated_at,'source_payload',x.source_payload
  ) order by x.source_updated_at desc,x.id),'[]'::jsonb) into recognitions
  from finance.collection_external_recognitions x where x.organization_id=p_org;
  return base||jsonb_build_object('assessments',assessments,'external_recognitions',recognitions);
end $$;

create or replace function finance.financial_report_live(p_org uuid,p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare base jsonb; recognition_total numeric; confirmed_loss_total numeric;
  trust_receipt_total numeric; cash_total numeric;
begin
  base:=finance.financial_report_live_cash_legacy(p_org,p_actor);
  select coalesce(sum(x.recognized_amount),0),coalesce(sum(x.loss_amount),0),
         coalesce(sum(x.actual_fund_amount),0)
    into recognition_total,confirmed_loss_total,trust_receipt_total
    from finance.collection_external_recognitions x
    where x.organization_id=p_org and x.status='ACTIVE';
  cash_total:=coalesce((base#>>'{quarterly,receipt_total}')::numeric,0);
  return jsonb_set(base,'{quarterly}',(base->'quarterly')||jsonb_build_object(
    'external_recognition_total',recognition_total,
    'confirmed_loss_total',confirmed_loss_total,
    'trust_receipt_total',trust_receipt_total,
    'satisfied_total',cash_total+recognition_total
  ),true);
end $$;

revoke all on function finance.classify_ledger_external_recognition(),
  finance.resolve_member_level_external_recognition_issue(),
  finance.collection_ledger_read(uuid,uuid),finance.financial_report_live(uuid,uuid)
  from public,anon,authenticated;
grant execute on function finance.collection_ledger_read(uuid,uuid),
  finance.financial_report_live(uuid,uuid) to service_role;

notify pgrst, 'reload schema';
