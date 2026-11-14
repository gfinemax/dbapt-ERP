"use server";

import { revalidatePath } from "next/cache";
import { requireExpenseActor, requireExpenseRecord } from "@/features/finance/expense-authorization";
import { commitExpenseCommand } from "@/features/finance/expense-resolution-repository";
import type { ManagedExpenseResolution } from "@/features/finance/expense-resolution-page";

export async function bindExpenseAuthorization(input: {
  id: string; expected: ManagedExpenseResolution; version: number; author: string;
  steps: { order: number; approver_user_id: string }[]; reason: string; key: string;
}) {
  const actor = await requireExpenseActor("ADMIN");
  const { resolution } = await requireExpenseRecord(input.id, false, actor);
  if (input.expected.id !== input.id || !input.reason.trim() || !input.key.trim()) throw new Error("연결할 원본과 확인 사유가 필요합니다.");
  const approverIds = input.steps.map((step) => step.approver_user_id);
  const expectedOrders = resolution.approvalLine.map((_, index) => index + 1);
  if (!input.author || input.steps.some(step => !expectedOrders.includes(step.order) || !step.approver_user_id) || new Set(input.steps.map(step => step.order)).size !== input.steps.length) {
    throw new Error("현재 결재선에서 확인된 작성자와 결재 계정을 연결해 주세요.");
  }
  if (new Set(approverIds).size !== approverIds.length) throw new Error("같은 계정을 여러 결재 순서에 중복 연결할 수 없습니다.");
  await commitExpenseCommand("BIND", input.id, input.expected, {
    author_user_id: input.author, steps: input.steps, reason: input.reason,
    expected_binding_version: input.version,
  }, input.key);
  revalidatePath("/finance/expense-authorizations");
  revalidatePath("/finance/expense-resolutions");
  revalidatePath("/finance/approval-inbox");
}
