begin;
do $$
declare org uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); saved jsonb;
 ids text[]:=array['resolution-list','vouchers','expense-entry','approval-inbox','bank','budget'];
begin
 insert into core.organizations(id,name,status) values(org,'Favorite menus test','active');
 insert into auth.users(id) values(actor),(other);
 insert into finance.reimbursement_members values(org,actor,'Actor','{}',true),(org,other,'Other','{}',true);
 saved:=finance.quick_menu_preferences_save(org,actor,ids,0,'favorites-first');
 if saved->'menu_ids'<>to_jsonb(ids) or saved->>'revision'<>'1' then raise exception 'TEST: new favorites save %',saved; end if;
 if finance.quick_menu_preferences_save(org,actor,ids,0,'favorites-first')<>saved then raise exception 'TEST: idempotent retry'; end if;
 perform finance.quick_menu_preferences_save(org,other,array['vouchers'],0,'favorites-other');
 if finance.quick_menu_preferences_read(org,actor)<>saved then raise exception 'TEST: account isolation'; end if;
 if finance.quick_menu_preferences_read(org,other)->'menu_ids'<>jsonb_build_array('vouchers') then raise exception 'TEST: other account'; end if;
 begin perform finance.quick_menu_preferences_save(org,actor,array['malicious'],1,'invalid'); raise exception 'TEST: invalid ID accepted'; exception when others then if sqlerrm not like '%지원하지 않는%' then raise; end if; end;
 begin perform finance.quick_menu_preferences_save(org,actor,array['vouchers','vouchers'],1,'duplicate'); raise exception 'TEST: duplicate accepted'; exception when others then if sqlerrm not like '%중복%' then raise; end if; end;
 begin perform finance.quick_menu_preferences_save(org,actor,ids,0,'stale'); raise exception 'TEST: stale revision accepted'; exception when others then if sqlerrm not like '%다른 화면%' then raise; end if; end;
 begin perform finance.quick_menu_preferences_save(org,actor,array[]::text[],1,'empty'); raise exception 'TEST: empty accepted'; exception when others then if sqlerrm not like '%1개 이상%' then raise; end if; end;
 saved:=finance.quick_menu_preferences_save(org,actor,array['vouchers','resolution-list'],1,'favorites-reorder');
 if saved->'menu_ids'<>jsonb_build_array('vouchers','resolution-list') or saved->>'revision'<>'2' then raise exception 'TEST: order update'; end if;
 perform finance.quick_menu_preferences_save(org,actor,array['members','collections','refunds','bank','cards','resolution','payments','evidence','arrears','advance','expenses','corporate-use'],2,'legacy-capacity');
 if (select count(*) from finance.workflow_events where organization_id=org and action='QUICK_MENU:SAVE')<>4 then raise exception 'TEST: audit events'; end if;
end $$;
rollback;
