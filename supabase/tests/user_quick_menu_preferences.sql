begin;
do $$
declare org uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); saved jsonb;
begin
 insert into core.organizations(id,name,status) values(org,'Quick menu test','active');
 insert into auth.users(id) values(actor),(other);
 insert into finance.reimbursement_members values(org,actor,'Actor','{}',true),(org,other,'Other','{}',false);
 if finance.quick_menu_preferences_read(org,actor)<>jsonb_build_object('menu_ids',null,'revision',0) then raise exception 'TEST: initial read'; end if;
 saved:=finance.quick_menu_preferences_save(org,actor,array['expenses','corporate-use'],0,'first');
 if saved<>jsonb_build_object('menu_ids',jsonb_build_array('expenses','corporate-use'),'revision',1) then raise exception 'TEST: first save %',saved; end if;
 if finance.quick_menu_preferences_save(org,actor,array['expenses','corporate-use'],0,'first')<>saved then raise exception 'TEST: retry'; end if;
 begin perform finance.quick_menu_preferences_save(org,actor,array['expenses'],0,'stale'); raise exception 'TEST: stale revision'; exception when others then if sqlerrm not like '%다른 화면%' then raise; end if; end;
 begin perform finance.quick_menu_preferences_save(org,actor,array['expenses','expenses'],1,'duplicate'); raise exception 'TEST: duplicate'; exception when others then if sqlerrm not like '%중복%' then raise; end if; end;
 begin perform finance.quick_menu_preferences_read(org,other); raise exception 'TEST: inactive user'; exception when others then if sqlerrm not like '%활성 사용자%' then raise; end if; end;
 if (select count(*) from finance.workflow_events where organization_id=org and action='QUICK_MENU:SAVE')<>1 then raise exception 'TEST: audit'; end if;
end $$;
set local role authenticated;
do $$ begin
 begin perform finance.quick_menu_preferences_read(gen_random_uuid(),gen_random_uuid()); raise exception 'TEST: direct RPC'; exception when insufficient_privilege then null; end;
 begin perform 1 from finance.user_quick_menu_preferences; raise exception 'TEST: direct table'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
