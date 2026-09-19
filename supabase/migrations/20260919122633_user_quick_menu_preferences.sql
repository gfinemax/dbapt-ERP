create table finance.user_quick_menu_preferences (
 organization_id uuid not null,
 user_id uuid not null,
 menu_ids text[] not null,
 revision integer not null default 1 check(revision>0),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(organization_id,user_id),
 foreign key(organization_id,user_id) references finance.reimbursement_members(organization_id,user_id),
 check(cardinality(menu_ids) between 1 and 12),
 check(menu_ids <@ array['members','collections','bank','cards','resolution','payments','evidence','arrears','advance','expenses','corporate-use','expense-entry','personal-refund','trust-operating','trust-business','readiness']::text[])
);

alter table finance.user_quick_menu_preferences enable row level security;
revoke all on finance.user_quick_menu_preferences from public,anon,authenticated;
grant select,insert,update,delete on finance.user_quick_menu_preferences to service_role;

create function finance.quick_menu_preferences_read(p_org uuid,p_actor uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare preference finance.user_quick_menu_preferences;
begin
 if not exists(select 1 from finance.reimbursement_members where organization_id=p_org and user_id=p_actor and active) then raise exception '활성 사용자 권한을 확인할 수 없습니다.'; end if;
 select * into preference from finance.user_quick_menu_preferences where organization_id=p_org and user_id=p_actor;
 if not found then return jsonb_build_object('menu_ids',null,'revision',0); end if;
 return jsonb_build_object('menu_ids',to_jsonb(preference.menu_ids),'revision',preference.revision);
end $$;

create function finance.quick_menu_preferences_save(p_org uuid,p_actor uuid,p_menu_ids text[],p_expected_revision integer,p_operation_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare preference finance.user_quick_menu_preferences; operation finance.workflow_operations; operation_input jsonb; result jsonb;
begin
 if not exists(select 1 from finance.reimbursement_members where organization_id=p_org and user_id=p_actor and active) then raise exception '활성 사용자 권한을 확인할 수 없습니다.'; end if;
 if coalesce(trim(p_operation_key),'')='' or length(p_operation_key)>120 then raise exception '저장 요청 키를 확인해주세요.'; end if;
 if p_expected_revision<0 then raise exception '설정 버전을 확인해주세요.'; end if;
 if cardinality(p_menu_ids) not between 1 and 12 or p_menu_ids is null then raise exception '퀵메뉴는 1개 이상 12개 이하로 선택해주세요.'; end if;
 if not (p_menu_ids <@ array['members','collections','bank','cards','resolution','payments','evidence','arrears','advance','expenses','corporate-use','expense-entry','personal-refund','trust-operating','trust-business','readiness']::text[]) then raise exception '지원하지 않는 퀵메뉴가 포함되어 있습니다.'; end if;
 if cardinality(p_menu_ids)<>(select count(distinct id) from unnest(p_menu_ids) id) then raise exception '퀵메뉴를 중복 선택할 수 없습니다.'; end if;
 operation_input:=jsonb_build_object('menu_ids',to_jsonb(p_menu_ids),'expected_revision',p_expected_revision);
 select * into operation from finance.workflow_operations where organization_id=p_org and operation_key='QUICK_MENU:'||p_operation_key;
 if found then
  if operation.actor_id<>p_actor or operation.command<>'QUICK_MENU:SAVE' or operation.input<>operation_input then raise exception '저장 요청 키가 다른 변경에 사용되었습니다.'; end if;
  return operation.result;
 end if;
 select * into preference from finance.user_quick_menu_preferences where organization_id=p_org and user_id=p_actor for update;
 if found then
  if preference.revision<>p_expected_revision then raise exception '다른 화면에서 퀵메뉴가 변경되었습니다.'; end if;
  update finance.user_quick_menu_preferences set menu_ids=p_menu_ids,revision=revision+1,updated_by=p_actor,updated_at=clock_timestamp()
   where organization_id=p_org and user_id=p_actor returning * into preference;
 else
  if p_expected_revision<>0 then raise exception '다른 화면에서 퀵메뉴가 변경되었습니다.'; end if;
  insert into finance.user_quick_menu_preferences(organization_id,user_id,menu_ids,updated_by) values(p_org,p_actor,p_menu_ids,p_actor) returning * into preference;
 end if;
 result:=jsonb_build_object('menu_ids',to_jsonb(preference.menu_ids),'revision',preference.revision);
 insert into finance.workflow_operations(organization_id,operation_key,actor_id,command,input,result) values(p_org,'QUICK_MENU:'||p_operation_key,p_actor,'QUICK_MENU:SAVE',operation_input,result);
 insert into finance.workflow_events(organization_id,actor_id,action,after_data) values(p_org,p_actor,'QUICK_MENU:SAVE',result);
 return result;
end $$;

revoke all on function finance.quick_menu_preferences_read(uuid,uuid),finance.quick_menu_preferences_save(uuid,uuid,text[],integer,text) from public,anon,authenticated;
grant execute on function finance.quick_menu_preferences_read(uuid,uuid),finance.quick_menu_preferences_save(uuid,uuid,text[],integer,text) to service_role;
