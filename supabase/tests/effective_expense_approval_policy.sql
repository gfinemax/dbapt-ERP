begin;
do $$
declare org uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); writer uuid:=gen_random_uuid(); director uuid:=gen_random_uuid(); chair uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 rid text:='period-'||gen_random_uuid()::text; protected_id text; doc jsonb; policy jsonb; result jsonb; saved jsonb; testdoc jsonb; request_doc jsonb; binding_steps jsonb; label text; changes jsonb;
begin
 insert into core.organizations(id,name,status) values(org,'Approval period test','active'),(other_org,'Other period test','active');
 insert into auth.users(id) values(admin_id),(writer),(director),(chair),(outsider);
 insert into finance.reimbursement_members values(org,admin_id,'관리자',array['ADMIN'],true),(org,writer,'오학동',array['APPROVE'],true),(org,director,'장현제',array['APPROVE'],true),(org,chair,'안동연',array['APPROVE'],true),(other_org,outsider,'외부 관리자',array['ADMIN'],true);
 doc:=jsonb_build_object('id',rid,'author','오학동 사무국장','approvalStatus','승인대기','currentApprover','장현제 이사','paymentStatus','지급전','totalPaymentAmount',1000,'history',jsonb_build_array(jsonb_build_object('id','original-request','actionType','REQUESTED_APPROVAL','actionLabel','승인요청')),
 'approvalLine',jsonb_build_array(
 jsonb_build_object('order',1,'approver','장현제','role','이사','status','결재대기'),
 jsonb_build_object('order',2,'approver','오학동','role','사무국장','status','대기'),
 jsonb_build_object('order',3,'approver','안동연','role','조합장','status','대기')),
 'approvalParticipants',jsonb_build_array(jsonb_build_object('name','장현제','title','이사','action','규정상 생략'),jsonb_build_object('name','오학동','title','사무국장','action','검토','approvalOrder',2),jsonb_build_object('name','안동연','title','조합장','action','최종결재','approvalOrder',3)));
 insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,current_approver_label,payment_status,total_payment_amount,resolution_data,subject) values(rid,org,'PERIOD-1','오학동 사무국장','승인대기','장현제 이사','지급전',1000,doc,'원문');
 binding_steps:=jsonb_build_array(
 jsonb_build_object('order',1,'approver_user_id',director,'legacy_step',doc->'approvalLine'->0),
 jsonb_build_object('order',2,'approver_user_id',writer,'legacy_step',doc->'approvalLine'->1),
 jsonb_build_object('order',3,'approver_user_id',chair,'legacy_step',doc->'approvalLine'->2));
 insert into finance.expense_authorization_bindings(resolution_id,organization_id,author_user_id,steps,version) values(rid,org,writer,binding_steps,1);
 policy:=jsonb_build_object('kind','HISTORICAL','referenceDate','2026-06-30','version','organization-approval-2026-07-v1','directorHiredOn','2026-06-22','directorApprovalFrom','2026-07-01','originalReference','원문 서명일 대조');
 begin perform finance.assert_expense_approval_period(doc||jsonb_build_object('approvalPolicy',policy),org,admin_id,null,false); raise exception 'TEST: before July approver accepted'; exception when others then if sqlerrm not like '%실제 결재선%' then raise; end if; end;
 perform finance.assert_expense_approval_period(doc||jsonb_build_object('approvalPolicy',policy||jsonb_build_object('referenceDate','2026-07-01')),org,admin_id,null,false);
 begin perform finance.assert_expense_approval_period(doc||jsonb_build_object('approvalPolicy',policy),org,writer,null,false); raise exception 'TEST: non-admin historical basis'; exception when others then if sqlerrm not like '%관리자%' then raise; end if; end;
 begin perform finance.repair_expense_approval_period(org,writer,rid,doc,1,'2026-06-30','원문 서명일 대조','non-admin'); raise exception 'TEST: non-admin repair'; exception when others then if sqlerrm not like '%관리자%' then raise; end if; end;
 begin perform finance.repair_expense_approval_period(other_org,outsider,rid,doc,1,'2026-06-30','원문 서명일 대조','foreign'); raise exception 'TEST: cross-org repair'; exception when others then if sqlerrm not like '%조직%' then raise; end if; end;
 begin perform finance.repair_expense_approval_period(org,admin_id,rid,doc,99,'2026-06-30','원문 서명일 대조','stale-version'); raise exception 'TEST: stale version'; exception when others then if sqlerrm not like '%연결이 변경%' then raise; end if; end;
 begin perform finance.repair_expense_approval_period(org,admin_id,rid,jsonb_set(doc,'{totalPaymentAmount}','9'),1,'2026-06-30','원문 서명일 대조','stale-source'); raise exception 'TEST: stale source'; exception when others then if sqlerrm not like '%원본이 변경%' then raise; end if; end;
 result:=finance.repair_expense_approval_period(org,admin_id,rid,doc,1,'2026-06-30','원문 서명일 대조','repair');
 saved:=result->'resolution';
 if jsonb_array_length(saved->'approvalLine')<>2 or saved#>>'{approvalLine,0,approver}'<>'오학동' or saved#>>'{approvalLine,0,order}'<>'1' or saved#>>'{approvalLine,1,approver}'<>'안동연' then raise exception 'TEST: repaired order %',saved; end if;
 if saved->>'approvalStatus'<>'작성중' or saved ? 'currentApprover' then raise exception 'TEST: pending document not recalled'; end if;
 if saved->>'totalPaymentAmount'<>'1000' or saved->>'paymentStatus'<>'지급전' or (select total_payment_amount from finance.expense_resolutions where id=rid)<>1000 then raise exception 'TEST: financial values changed'; end if;
 if saved#>>'{history,0,id}'<>'original-request' or saved#>>'{history,1,actionLabel}'<>'결재선 정정 회수' then raise exception 'TEST: history not preserved'; end if;
 if result#>>'{authorization,version}'<>'2' or result#>>'{authorization,steps,0,approver_user_id}'<>writer::text or result#>>'{authorization,steps,1,approver_user_id}'<>chair::text then raise exception 'TEST: UUID remapping'; end if;
 if jsonb_array_length(saved->'approvalParticipants')<>2 or saved#>>'{approvalParticipants,0,approvalOrder}'<>'1' then raise exception 'TEST: display participant remapping'; end if;
 if finance.repair_expense_approval_period(org,admin_id,rid,doc,1,'2026-06-30','원문 서명일 대조','repair')<>result then raise exception 'TEST: idempotent retry'; end if;
 if (select count(*) from finance.expense_workflow_audit_logs where resolution_id=rid and action='AUTH:POLICY_REPAIR')<>1 then raise exception 'TEST: duplicate audit'; end if;
 begin perform finance.repair_expense_approval_period(org,admin_id,rid,doc,1,'2026-06-30','다른 근거','repair'); raise exception 'TEST: mismatched operation retry'; exception when others then if sqlerrm not like '%처리키%' then raise; end if; end;
 begin update finance.expense_resolutions set resolution_data=jsonb_set(resolution_data,'{approvalPolicy,referenceDate}','"2026-07-01"') where id=rid; raise exception 'TEST: direct policy rewrite'; exception when others then if sqlerrm not like '%원자적 저장%' then raise; end if; end;
 request_doc:=jsonb_set(saved,'{author}','"장현제 이사"');
 request_doc:=jsonb_set(request_doc,'{approvalParticipants}','[{"name":"장현제","title":"이사","action":"작성"}]');
 request_doc:=jsonb_set(request_doc,'{approvalPolicy,referenceDate}','"2026-06-22"');
 perform finance.assert_expense_approval_period(request_doc,org,admin_id,null,false);
 begin perform finance.assert_expense_approval_period(jsonb_set(request_doc,'{approvalPolicy,referenceDate}','"2026-06-21"'),org,admin_id,null,false); raise exception 'TEST: pre-employment author'; exception when others then if sqlerrm not like '%작성자%' then raise; end if; end;
 request_doc:=jsonb_set(saved,'{approvalPolicy,kind}','"CURRENT"');
 request_doc:=jsonb_set(request_doc,'{approvalPolicy,referenceDate}',to_jsonb(to_char((current_timestamp at time zone 'Asia/Seoul')::date-1,'YYYY-MM-DD')));
 begin perform finance.assert_expense_approval_period(request_doc,org,admin_id,saved,true); raise exception 'TEST: stale submission day'; exception when others then if sqlerrm not like '%상신일%' then raise; end if; end;
 perform finance.assert_expense_approval_period(request_doc,org,admin_id,request_doc,false);
 begin perform finance.assert_expense_approval_period(request_doc,org,writer,saved,false); raise exception 'TEST: non-admin removed historical basis'; exception when others then if sqlerrm not like '%관리자%' then raise; end if; end;
 begin perform finance.legacy_expense_command(org,admin_id,'APPROVAL',rid,saved,jsonb_build_object('command','REQUEST','after',request_doc),'forged-policy-switch'); raise exception 'TEST: approval changed frozen basis'; exception when others then if sqlerrm not like '%기준일을 변경%' then raise; end if; end;
 testdoc:=(request_doc-'originalReference')||jsonb_build_object('id',rid||'-new','author','오학동','history','[]'::jsonb);
 testdoc:=jsonb_set(testdoc,'{approvalPolicy,referenceDate}',to_jsonb(to_char((current_timestamp at time zone 'Asia/Seoul')::date,'YYYY-MM-DD')));
 perform finance.legacy_expense_command(org,writer,'SAVE',rid||'-new',null,jsonb_build_object(
  'row',jsonb_build_object('id',rid||'-new','resolution_no','PERIOD-NEW','author_label','오학동','approval_status','작성중','payment_status','지급전','total_payment_amount',1000,'resolution_data',testdoc),
  'items','[]'::jsonb,'allocations','[]'::jsonb,'evidence','[]'::jsonb,'details','[]'::jsonb),'valid-current-save');
 begin perform finance.assert_expense_approval_period(saved-'approvalPolicy',org,writer,saved,false); raise exception 'TEST: confirmed basis removed'; exception when others then if sqlerrm not like '%삭제할 수 없습니다%' then raise; end if; end;
 begin perform finance.legacy_expense_command(org,director,'APPROVAL',rid,saved,jsonb_build_object('command','APPROVE','after',saved),'director-behind-other-label'); raise exception 'TEST: actual director account bypassed period'; exception when others then if sqlerrm not like '%권한 시작일%' then raise; end if; end;
 -- Approved, partially approved and paid/vouchered originals cannot be repaired.
 for label,changes in select * from (values
 ('approved','{"approvalStatus":"승인완료"}'::jsonb),('paid','{"paymentStatus":"지급완료"}'::jsonb),
 ('hidden-approved','{"paidAt":"","approvedAt":"2026-06-30"}'::jsonb),('voucher','{"voucherNo":"V-1"}'::jsonb),('partial','{"history":[{"actionType":"APPROVED","actionLabel":"결재승인"}]}'::jsonb)
 ) cases loop
  protected_id:=rid||'-'||label;
  testdoc:=(doc||changes)||jsonb_build_object('id',protected_id);
  insert into finance.expense_resolutions(id,organization_id,resolution_no,author_label,approval_status,payment_status,total_payment_amount,resolution_data,subject) values(protected_id,org,'PERIOD-'||label,'오학동',testdoc->>'approvalStatus',testdoc->>'paymentStatus',1000,testdoc,'보존 대상');
  begin perform finance.repair_expense_approval_period(org,admin_id,protected_id,testdoc,0,'2026-06-30','원문 대조','protected-'||label); raise exception 'TEST: protected source changed'; exception when others then if sqlerrm not like '%원본을 보존%' and sqlerrm not like '%자동 변경%' and sqlerrm not like '%승인 이력%' then raise; end if; end;
  if (select resolution_data from finance.expense_resolutions where id=protected_id)<>testdoc then raise exception 'TEST: protected original mutated'; end if;
 end loop;
end $$;
set local role authenticated;
do $$ begin
 begin perform finance.repair_expense_approval_period(gen_random_uuid(),gen_random_uuid(),'id','{}',0,'2026-06-30','reason','key'); raise exception 'TEST: direct authenticated RPC'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
