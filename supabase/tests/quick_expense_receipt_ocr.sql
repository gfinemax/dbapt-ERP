begin;
do $$
declare org uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); employee uuid:=gen_random_uuid();
 qid uuid:=gen_random_uuid(); other_qid uuid:=gen_random_uuid(); job_id uuid:=gen_random_uuid(); foreign_job uuid:=gen_random_uuid(); tx uuid; before_time timestamptz; result jsonb; workspace jsonb;
begin
 insert into core.organizations(id,name,status) values(org,'Quick OCR test','active'),(other_org,'Other org','active');
 insert into auth.users(id) values(admin_id),(employee);
 insert into finance.reimbursement_members values(org,admin_id,'Admin',array['ADMIN'],true),(org,employee,'Employee','{}',true);
 insert into approval.budgets(organization_id,fiscal_year,budget_item,approved_amount,executed_amount,monthly_amount)
 values(org,2026,'운영비',1200000,0,100000);
 insert into finance.quick_expense_records(id,organization_id,source_type,payment_method,occurred_at,amount,counterparty,usage_description,budget_item,evidence_status,approval_skip_reason,direct_expense_decision,record_status,recorded_by_label)
 values(qid,org,'MANUAL','CORPORATE_CARD','2026-09-07',14000,'다이소','사무용품','운영비','NONE','승인 예산 내 일상 지출','ALLOWED','SOURCE_PENDING','Admin'),
 (other_qid,org,'MANUAL','CASH','2026-09-07',1000,'다른 거래처','다른 지출','운영비','NONE','일상 지출','ALLOWED','RECORDED','Admin');
 tx:=(finance.workflow_command(org,admin_id,'ENROLL',jsonb_build_object('source_kind','QUICK','source_id',qid),'quick-ocr-enroll')->>'id')::uuid;
 insert into finance.expense_evidence_ocr_jobs(id,resolution_no,storage_bucket,storage_path,original_filename,content_type,evidence_type,status,stage,progress,result_data,organization_id,created_by)
 values(job_id,'QUICK-'||qid,'expense-evidence',org||'/'||admin_id||'/quick/receipt.jpg','receipt.jpg','image/jpeg','영수증','COMPLETED','COMPLETED',100,'{"issuer":"(주)아성다이소봉천본점","totalAmount":14000,"itemName":"서류꽂이"}',org,admin_id),
 (foreign_job,'QUICK-X','expense-evidence','foreign/path.jpg','foreign.jpg','image/jpeg','영수증','COMPLETED','COMPLETED',100,'{}',other_org,admin_id);
 select updated_at into before_time from finance.quick_expense_records where id=qid;
 result:=finance.quick_expense_command(org,admin_id,'ATTACH_EVIDENCE',qid,jsonb_build_object('ocr_job_id',job_id),'attach-1');
 if finance.quick_expense_command(org,admin_id,'ATTACH_EVIDENCE',qid,jsonb_build_object('ocr_job_id',job_id),'attach-1')<>result
   or (select count(*) from finance.quick_expense_evidence where ocr_job_id=job_id)<>1 then raise exception 'TEST: attachment retry duplicated'; end if;
 if (select evidence_status from finance.quick_expense_records where id=qid)<>'GENERAL' then raise exception 'TEST: evidence state not stored'; end if;
 workspace:=finance.expense_workspace(org,admin_id);
 if not exists(select 1 from jsonb_array_elements(workspace->'records') r where r->>'source_id'=qid::text and r#>>'{evidence_files,0,ocr_job_id}'=job_id::text and r#>>'{evidence_files,0,result_data,issuer}'='(주)아성다이소봉천본점') then raise exception 'TEST: saved OCR evidence not reloaded'; end if;
 result:=finance.quick_expense_command(org,admin_id,'UPDATE_DETAILS',qid,jsonb_build_object('usage_description','서류꽂이, 건전지','counterparty','(주)아성다이소봉천본점','expected_updated_at',(select updated_at::text from finance.quick_expense_records where id=qid)),'edit-1');
 if (select usage_description<>'서류꽂이, 건전지' or counterparty<>'(주)아성다이소봉천본점' or amount<>14000 from finance.quick_expense_records where id=qid) then raise exception 'TEST: reviewed OCR fields not saved safely'; end if;
 if (select count(*) from finance.quick_expense_audit where quick_expense_id=qid)<>2 then raise exception 'TEST: audit missing'; end if;
 if (select source_signature from finance.workflow_transactions where id=tx)=finance.workflow_source(org,'QUICK',qid::text)->>'signature' then raise exception 'TEST: connected workflow did not detect edited original'; end if;
 begin perform finance.quick_expense_command(org,admin_id,'UPDATE_DETAILS',qid,jsonb_build_object('usage_description','stale','counterparty','','expected_updated_at',before_time::text),'edit-stale'); raise exception 'TEST: stale edit accepted'; exception when others then if sqlerrm not like '%먼저 수정%' then raise; end if; end;
 begin perform finance.quick_expense_command(org,employee,'UPDATE_DETAILS',qid,jsonb_build_object('usage_description','forged','counterparty','','expected_updated_at',(select updated_at::text from finance.quick_expense_records where id=qid)),'edit-role'); raise exception 'TEST: role bypass'; exception when others then if sqlerrm not like '%수정 권한%' then raise; end if; end;
 begin perform finance.quick_expense_command(org,admin_id,'ATTACH_EVIDENCE',other_qid,jsonb_build_object('ocr_job_id',job_id),'attach-other'); raise exception 'TEST: evidence reused'; exception when others then if sqlerrm not like '%다른 간편지출%' then raise; end if; end;
 begin perform finance.quick_expense_command(org,admin_id,'ATTACH_EVIDENCE',qid,jsonb_build_object('ocr_job_id',foreign_job),'attach-foreign'); raise exception 'TEST: foreign evidence accepted'; exception when others then if sqlerrm not like '%찾을 수 없습니다%' then raise; end if; end;
end $$;
do $$ begin
 if has_function_privilege('authenticated','finance.quick_expense_command(uuid,uuid,text,uuid,jsonb,text)','EXECUTE')
   or has_table_privilege('authenticated','finance.quick_expense_evidence','SELECT') then raise exception 'TEST: quick OCR storage exposed'; end if;
end $$;
rollback;
