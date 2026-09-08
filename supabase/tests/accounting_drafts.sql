begin;
do $$
declare org uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); approver uuid:=gen_random_uuid(); pay_id uuid:=gen_random_uuid(); employee uuid:=gen_random_uuid();
 source_id text:=gen_random_uuid()::text; source2 text:=gen_random_uuid()::text; tx uuid; tx2 uuid; account_id uuid:=gen_random_uuid(); foreign_account uuid:=gen_random_uuid(); inactive_account uuid:=gen_random_uuid();
 bank_account uuid:=gen_random_uuid(); bank2 uuid:=gen_random_uuid(); withdrawal uuid:=gen_random_uuid(); deposit uuid:=gen_random_uuid(); bank_pay uuid:=gen_random_uuid(); payment uuid; transfer uuid;
 input jsonb; saved jsonb; original jsonb; result jsonb; source jsonb; vid uuid; pay_vid uuid; legacy_vid uuid:=gen_random_uuid(); old_lines text; old_original text;
begin
 insert into core.organizations(id,name,status) values(org,'Accounting test','active'),(other_org,'Other accounting','active');
 insert into auth.users(id) values(admin_id),(approver),(pay_id),(employee);
 insert into finance.reimbursement_members values(org,admin_id,'Admin',array['ADMIN'],true),(org,approver,'Approver',array['APPROVE'],true),(org,pay_id,'Pay',array['PAY'],true),(org,employee,'Employee','{}',true);
 insert into finance.account_subjects(id,organization_id,code,name,is_active) values(account_id,org,'A1','Reviewed account',true),(foreign_account,other_org,'A1','Other account',true),(inactive_account,org,'A2','Inactive',false);
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,resolution_data)
 values(source_id,org,'ACCOUNTING-SOURCE-1','Staff','승인완료','지급대기',1000,'{}'),(source2,org,'ACCOUNTING-SOURCE-2','Staff','승인완료','지급대기',500,'{}');
 tx:=(finance.workflow_command(org,admin_id,'ENROLL',jsonb_build_object('source_kind','RESOLUTION','source_id',source_id),'account-enroll1')->>'id')::uuid;
 tx2:=(finance.workflow_command(org,admin_id,'ENROLL',jsonb_build_object('source_kind','RESOLUTION','source_id',source2),'account-enroll2')->>'id')::uuid;
 select md5(to_jsonb(r)::text) into old_original from finance.expense_resolutions r where id=source_id;
 source:=finance.accounting_source(org,'RECOGNITION',tx);
 input:=jsonb_build_object('source_kind','RECOGNITION','source_id',tx,'source_signature',source->>'signature','voucher_date','2026-03-20','memo','Usage recognition draft','lines',jsonb_build_array(
  jsonb_build_object('account_subject_id',account_id,'description','Usage','debit_amount',1000,'credit_amount',0),
  jsonb_build_object('account_subject_id',null,'description','Unmapped liability','debit_amount',0,'credit_amount',1000)));
 saved:=finance.accounting_command(org,approver,'DRAFT_CREATE',input,'create1'); vid:=(saved->>'id')::uuid;
 if finance.accounting_command(org,approver,'DRAFT_CREATE',input,'create1')<>saved then raise exception 'TEST: retry result'; end if;
 if (select count(*) from finance.vouchers where organization_id=org)<>1 or (select count(*) from finance.voucher_lines where voucher_id=vid)<>2 then raise exception 'TEST: exactly one balanced draft'; end if;
 if (select approval_status from finance.vouchers where id=vid)<>'승인대기' or (select voucher_date from finance.vouchers where id=vid)<>'2026-03-20'::date then raise exception 'TEST: draft/date'; end if;
 if old_original<>(select md5(to_jsonb(r)::text) from finance.expense_resolutions r where id=source_id) then raise exception 'TEST: source modified'; end if;
 begin perform finance.accounting_command(org,approver,'DRAFT_CREATE',input,'different-key'); raise exception 'TEST: duplicate business source'; exception when others then if sqlerrm not like '%이미 연결%' then raise; end if; end;
 begin perform finance.accounting_command(org,approver,'DRAFT_CREATE',input||'{"memo":"changed"}','create1'); raise exception 'TEST: key reused changed'; exception when others then if sqlerrm not like '%처리키%' then raise; end if; end;
 begin perform finance.accounting_command(org,pay_id,'DRAFT_CREATE',input,'pay-write'); raise exception 'TEST: pay writes'; exception when others then if sqlerrm not like '%권한%' then raise; end if; end;
 begin perform finance.accounting_command(org,approver,'DRAFT_CREATE',input||jsonb_build_object('source_id',gen_random_uuid()),'foreign-source'); raise exception 'TEST: wrong source'; exception when others then if sqlerrm not like '%원본을 찾을%' then raise; end if; end;
 begin perform finance.accounting_command(org,approver,'DRAFT_CREATE',input||jsonb_build_object('organization_id',other_org),'forged-org'); raise exception 'TEST: forged org'; exception when others then if sqlerrm not like '%입력 형식%' then raise; end if; end;
 begin perform finance.accounting_workspace(org,employee); raise exception 'TEST: employee reads'; exception when others then if sqlerrm not like '%조회 권한%' then raise; end if; end;
 begin perform finance.accounting_workspace(other_org,approver); raise exception 'TEST: cross org reads'; exception when others then if sqlerrm not like '%조직 권한%' then raise; end if; end;
 result:=finance.accounting_workspace(org,pay_id);
 if jsonb_array_length(result->'vouchers')<>1 or jsonb_array_length(result->'accounts')<>2 or result#>>'{policy,confirmation_enabled}'<>'false' then raise exception 'TEST: workspace isolation/policy'; end if;
 if result#>>'{vouchers,0,source_stale}'<>'false' or result#>>'{vouchers,0,managed}'<>'true' then raise exception 'TEST: fresh linked draft'; end if;
 begin update finance.vouchers set approval_status='승인완료' where id=vid; raise exception 'TEST: legacy confirms managed draft'; exception when others then if sqlerrm not like '%회계 저장 명령%' then raise; end if; end;
 begin delete from finance.voucher_lines where voucher_id=vid; raise exception 'TEST: legacy deletes managed lines'; exception when others then if sqlerrm not like '%회계 저장 명령%' then raise; end if; end;
 begin delete from finance.workflow_voucher_controls where voucher_id=vid; raise exception 'TEST: bypass control removal'; exception when others then if sqlerrm not like '%회계 저장 명령%' then raise; end if; end;
 begin perform finance.accounting_legacy_check(org,approver,source_id); raise exception 'TEST: managed legacy check allowed'; exception when others then if sqlerrm not like '%전표관리에서 확인%' then raise; end if; end;
 perform finance.accounting_legacy_check(org,approver,source2);
 begin perform finance.accounting_legacy_check(other_org,approver,source2); raise exception 'TEST: legacy check cross org'; exception when others then if sqlerrm not like '%조직 권한%' then raise; end if; end;
 begin update finance.expense_resolutions set voucher_status='전표확정' where id=source_id; raise exception 'TEST: legacy resolution first write'; exception when others then if sqlerrm not like '%전표관리에서 확인%' then raise; end if; end;
 begin update finance.expense_resolutions set resolution_data=resolution_data||'{"voucherNo":"forged"}' where id=source_id; raise exception 'TEST: legacy resolution JSON'; exception when others then if sqlerrm not like '%전표관리에서 확인%' then raise; end if; end;
 begin insert into finance.vouchers(organization_id,voucher_no,voucher_date,expense_resolution_id) values(org,'forged-new','2026-03-01',source_id); raise exception 'TEST: legacy duplicate insert'; exception when others then if sqlerrm not like '%전표관리에서 확인%' then raise; end if; end;
 begin perform finance.accounting_command(org,admin_id,'CONFIRM',jsonb_build_object('id',vid),'confirm'); raise exception 'TEST: policy-free confirm'; exception when others then if sqlerrm not like '%정책 확인%' then raise; end if; end;
 original:=input;
 input:=jsonb_build_object('id',vid,'lock_version',1,'source_signature',source->>'signature','voucher_date','2026-03-21','memo','Reviewed draft','lines',original->'lines');
 select md5(jsonb_agg(to_jsonb(l) order by l.id)::text) into old_lines from finance.voucher_lines l where voucher_id=vid;
 begin perform finance.accounting_command(org,approver,'DRAFT_SAVE',jsonb_set(input,'{lines,0,account_subject_id}',to_jsonb(foreign_account)),'bad-account'); raise exception 'TEST: foreign account'; exception when others then if sqlerrm not like '%계정과목%' then raise; end if; end;
 begin perform finance.accounting_command(org,approver,'DRAFT_SAVE',jsonb_set(input,'{lines,0,account_subject_id}',to_jsonb(inactive_account)),'inactive'); raise exception 'TEST: inactive account'; exception when others then if sqlerrm not like '%계정과목%' then raise; end if; end;
 begin perform finance.accounting_command(org,approver,'DRAFT_SAVE',jsonb_set(input,'{lines,0,debit_amount}','1.5'),'fraction'); raise exception 'TEST: rounded fraction'; exception when others then if sqlerrm not like '%원 단위%' then raise; end if; end;
 if old_lines<>(select md5(jsonb_agg(to_jsonb(l) order by l.id)::text) from finance.voucher_lines l where voucher_id=vid) or (select lock_version from finance.workflow_voucher_controls where voucher_id=vid)<>1 then raise exception 'TEST: failed save changed lines'; end if;
 saved:=finance.accounting_command(org,approver,'DRAFT_SAVE',input,'save1');
 if (saved->>'lock_version')::integer<>2 then raise exception 'TEST: version increment'; end if;
 begin perform finance.accounting_command(org,approver,'DRAFT_SAVE',input,'stale-editor'); raise exception 'TEST: stale edit'; exception when others then if sqlerrm not like '%다른 사용자%' then raise; end if; end;
 update finance.expense_resolutions set total_payment_amount=1200 where id=source_id;
 if finance.accounting_workspace(org,approver)#>>'{vouchers,0,source_stale}'<>'true' then raise exception 'TEST: changed original not indicated'; end if;
 begin perform finance.accounting_command(org,approver,'DRAFT_SAVE',input||'{"lock_version":2}','stale-source'); raise exception 'TEST: stale source accepted'; exception when others then if sqlerrm not like '%원본이 변경%' then raise; end if; end;
 source:=finance.accounting_source(org,'RECOGNITION',tx);
 saved:=finance.accounting_command(org,approver,'DRAFT_SAVE',input||jsonb_build_object('lock_version',2,'source_signature',source->>'signature','lines','[]'::jsonb),'review-current');
 if (saved->>'lock_version')::integer<>3 or (select count(*) from finance.voucher_lines where voucher_id=vid)<>0 then raise exception 'TEST: incomplete re-reviewed draft'; end if;
 -- Existing unmanaged vouchers remain readable and unchanged; conflicts are not auto adopted.
 insert into finance.vouchers(id,organization_id,voucher_no,voucher_date,approval_status,expense_resolution_id) values(legacy_vid,org,'OLD-1','2026-01-01','승인완료',source2);
 source:=finance.accounting_source(org,'RECOGNITION',tx2);
 begin perform finance.accounting_command(org,admin_id,'DRAFT_CREATE',original||jsonb_build_object('source_id',tx2,'source_signature',source->>'signature'),'legacy-duplicate'); raise exception 'TEST: legacy source duplicate'; exception when others then if sqlerrm not like '%이미 연결%' then raise; end if; end;
 update finance.vouchers set memo='Legacy preserved' where id=legacy_vid;
 if (select approval_status from finance.vouchers where id=legacy_vid)<>'승인완료' then raise exception 'TEST: legacy state changed'; end if;
 -- Actual payment and transfer each produce their own source, no invented expenses.
 insert into finance.bank_accounts(id,organization_id,bank_name,account_name,account_no,account_type,usage_status) values(bank_account,org,'Bank','Management','123456789012','신탁계좌','사용'),(bank2,org,'Bank','Operating','987654321012','운영계좌','사용');
 insert into finance.bank_transactions(id,organization_id,bank_account_id,transacted_at,description,withdrawal_amount,deposit_amount) values(bank_pay,org,bank_account,'2026-06-01','Payment',700,0),(withdrawal,org,bank_account,'2026-06-01','Transfer out',400,0),(deposit,org,bank2,'2026-06-01','Transfer in',0,400);
 payment:=(finance.workflow_command(org,admin_id,'PAYMENT_RECORD',jsonb_build_object('method','BANK','bank_transaction_id',bank_pay,'reason','Actual bank'),'pay-record')->>'id')::uuid;
 source:=finance.accounting_source(org,'PAYMENT',payment);
 saved:=finance.accounting_command(org,admin_id,'DRAFT_CREATE',jsonb_build_object('source_kind','PAYMENT','source_id',payment,'source_signature',source->>'signature','voucher_date','2026-06-01','lines','[]'::jsonb),'payment-voucher');
 pay_vid:=(saved->>'id')::uuid;
 if (select bank_transaction_id from finance.vouchers where id=pay_vid)<>bank_pay then raise exception 'TEST: actual bank bridge missing'; end if;
 transfer:=(finance.workflow_command(org,admin_id,'TRANSFER',jsonb_build_object('withdrawal_id',withdrawal,'deposit_id',deposit,'reason','Same organization transfer'),'transfer')->>'id')::uuid;
 source:=finance.accounting_source(org,'TRANSFER',transfer);
 perform finance.accounting_command(org,admin_id,'DRAFT_CREATE',jsonb_build_object('source_kind','TRANSFER','source_id',transfer,'source_signature',source->>'signature','voucher_date','2026-06-01','lines','[]'::jsonb),'transfer-voucher');
 result:=finance.accounting_workspace(org,admin_id);
 if result::text like '%123456789012%' or result::text like '%987654321012%' or result::text like '%source_snapshot%' then raise exception 'TEST: private source data exposed'; end if;
 if (select count(*) from finance.workflow_events where organization_id=org and action like 'ACCOUNTING_%')<>5 then raise exception 'TEST: audit count'; end if;
end $$;
do $$
declare org uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); rid text:=gen_random_uuid()::text; qid uuid:=gen_random_uuid(); txq uuid; txr uuid; s jsonb; v uuid; result jsonb;
begin
 insert into core.organizations(id,name,status) values(org,'Bridge accounting test','active');
 insert into auth.users(id) values(actor);
 insert into finance.reimbursement_members values(org,actor,'Admin',array['ADMIN'],true);
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,resolution_data) values(rid,org,'BRIDGE','Staff','승인완료','지급대기',100,'{}');
 insert into finance.quick_expense_records(id,organization_id,source_type,payment_method,occurred_at,amount,usage_description,budget_item,approval_skip_reason,direct_expense_decision,recorded_by_label,linked_resolution_id,record_status)
 values(qid,org,'MANUAL','CASH','2026-09-01',100,'Same usage','Operating','Reviewed','ALLOWED','Staff',rid,'CONVERTED');
 txq:=(finance.workflow_command(org,actor,'ENROLL',jsonb_build_object('source_kind','QUICK','source_id',qid),'quick')->>'id')::uuid;
 txr:=(finance.workflow_command(org,actor,'ENROLL',jsonb_build_object('source_kind','RESOLUTION','source_id',rid),'resolution')->>'id')::uuid;
 s:=finance.accounting_source(org,'RECOGNITION',txq);
 v:=(finance.accounting_command(org,actor,'DRAFT_CREATE',jsonb_build_object('source_kind','RECOGNITION','source_id',txq,'source_signature',s->>'signature','voucher_date','2026-09-01','lines','[]'::jsonb),'quickdraft')->>'id')::uuid;
 s:=finance.accounting_source(org,'RECOGNITION',txr);
 if (s->>'existing_voucher_id')::uuid<>v then raise exception 'TEST: quick-first resolution bridge'; end if;
 begin perform finance.accounting_legacy_check(org,actor,rid); raise exception 'TEST: converted quick legacy mutation'; exception when others then if sqlerrm not like '%전표관리에서 확인%' then raise; end if; end;
 begin perform finance.accounting_command(org,actor,'DRAFT_CREATE',jsonb_build_object('source_kind','RECOGNITION','source_id',txr,'source_signature',s->>'signature','voucher_date','2026-09-01','lines','[]'::jsonb),'duplicate-resolution'); raise exception 'TEST: duplicate converted usage'; exception when others then if sqlerrm not like '%이미 연결%' then raise; end if; end;
 update finance.quick_expense_records set amount=100000000000000 where id=qid;
 result:=finance.accounting_workspace(org,actor);
 if jsonb_array_length(result->'vouchers')<>1 or not exists(select 1 from jsonb_array_elements(result->'sources') unavailable where unavailable->>'id'=txq::text and unavailable->>'blocked_reason' is not null and unavailable->'amount'='null'::jsonb and unavailable->>'signature'='') then raise exception 'TEST: unavailable source hides workspace or invents zero'; end if;
 if result#>>'{vouchers,0,source_stale}'<>'true' then raise exception 'TEST: unavailable source not stale'; end if;
end $$;
set local role authenticated;
do $$ begin
 begin perform finance.accounting_workspace(gen_random_uuid(),gen_random_uuid()); raise exception 'TEST: authenticated RPC accessible'; exception when insufficient_privilege then null; end;
 begin perform 1 from finance.workflow_voucher_links; raise exception 'TEST: authenticated links accessible'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
