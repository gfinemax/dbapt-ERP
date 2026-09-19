import { reimbursementDb } from "./reimbursement-repository";
import { requireReimbursementIdentity } from "./reimbursement-auth";
import { validQuickMenuIds, type QuickMenuId } from "./erp-quick-menu-catalog";

export type QuickMenuPreferenceResult = {
  authenticated: boolean;
  menuIds: QuickMenuId[] | null;
  revision: number;
};

export async function loadQuickMenuPreferences(): Promise<QuickMenuPreferenceResult> {
  const member = await requireReimbursementIdentity();
  const { data, error } = await reimbursementDb().schema("finance").rpc("quick_menu_preferences_read", {
    p_org: member.organization_id,
    p_actor: member.user_id,
  });
  if (error) throw new Error(`퀵메뉴 설정 조회 실패: ${error.message}`);
  const result = data as { menu_ids?: unknown; revision?: unknown } | null;
  return {
    authenticated: true,
    menuIds: Array.isArray(result?.menu_ids) ? validQuickMenuIds(result.menu_ids) : null,
    revision: typeof result?.revision === "number" ? result.revision : 0,
  };
}

export async function saveQuickMenuPreferences(menuIds: QuickMenuId[], expectedRevision: number, operationKey: string) {
  const member = await requireReimbursementIdentity();
  const normalized = validQuickMenuIds(menuIds);
  if (normalized.length !== menuIds.length) throw new Error("지원하지 않는 퀵메뉴가 포함되어 있어.");
  const { data, error } = await reimbursementDb().schema("finance").rpc("quick_menu_preferences_save", {
    p_org: member.organization_id,
    p_actor: member.user_id,
    p_menu_ids: normalized,
    p_expected_revision: expectedRevision,
    p_operation_key: operationKey,
  });
  if (error) throw new Error(error.message.includes("다른 화면") ? "다른 화면에서 퀵메뉴가 변경됐어. 새로고침 후 다시 저장해줘." : `퀵메뉴 설정 저장 실패: ${error.message}`);
  const result = data as { menu_ids: QuickMenuId[]; revision: number };
  return { menuIds: validQuickMenuIds(result.menu_ids), revision: result.revision };
}
