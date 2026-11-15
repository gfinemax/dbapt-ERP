"use server";
import { revalidatePath } from "next/cache";
import { expenseDb, requireExpenseActor, requireExpenseRecord } from "@/features/finance/expense-authorization";
import { previewExpenseApprovalRepair } from "@/features/finance/expense-approval-period";
import { stripExpenseAuthorization } from "@/features/finance/expense-resolution-repository";
import type { ManagedExpenseResolution } from "@/features/finance/expense-resolution-page";

export async function previewExpenseApprovalPeriodRepairAction(id: string, referenceDate: string, reason: string) {
  const actor = await requireExpenseActor("ADMIN");
  const { resolution, binding } = await requireExpenseRecord(id, false, actor);
  return previewExpenseApprovalRepair({ ...resolution, authorization: binding }, referenceDate, reason);
}
export async function applyExpenseApprovalPeriodRepairAction(input: {
  id: string; expected: ManagedExpenseResolution; expectedVersion: number; referenceDate: string; reason: string; key: string;
}) {
  const actor = await requireExpenseActor("ADMIN");
  if (input.expected.id !== input.id || !input.key.trim() || !input.reason.trim()) throw new Error("미리보기한 원본과 확인 근거가 필요합니다.");
  await requireExpenseRecord(input.id, false, actor);
  const preview = previewExpenseApprovalRepair(input.expected, input.referenceDate, input.reason);
  if (!preview.canApply) throw new Error(preview.issues.join(" "));
  const { data, error } = await expenseDb().schema("finance").rpc("repair_expense_approval_period", {
    p_org: actor.organization_id, p_actor: actor.user_id, p_id: input.id,
    p_expected: stripExpenseAuthorization(input.expected), p_expected_version: input.expectedVersion,
    p_reference_date: input.referenceDate, p_reason: input.reason.trim(), p_key: input.key,
  });
  if (error) throw new Error(error.code === "PGRST202" ? "결재선 기간 정리 DB 마이그레이션을 먼저 적용해주세요." : error.message);
  const result = data as { resolution: ManagedExpenseResolution; authorization: ManagedExpenseResolution["authorization"] };
  for (const path of ["/finance/expense-authorizations", "/finance/expense-resolutions", "/finance/approval-inbox", "/approval/inbox", "/finance/workspace"]) revalidatePath(path);
  return { ...result.resolution, authorization: result.authorization };
}
