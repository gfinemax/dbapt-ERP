"use server";

import { loadQuickMenuPreferences, saveQuickMenuPreferences } from "@/features/finance/quick-menu-preferences";
import type { QuickMenuId } from "@/features/finance/erp-quick-menu-catalog";

export async function loadQuickMenuPreferencesAction() {
  try { return await loadQuickMenuPreferences(); }
  catch (error) {
    if (error instanceof Error && error.message === "정산 업무 로그인이 필요합니다.") return { authenticated: false as const, menuIds: null, revision: 0 };
    throw error;
  }
}

export async function saveQuickMenuPreferencesAction(menuIds: QuickMenuId[], expectedRevision: number, operationKey: string) {
  return saveQuickMenuPreferences(menuIds, expectedRevision, operationKey);
}
