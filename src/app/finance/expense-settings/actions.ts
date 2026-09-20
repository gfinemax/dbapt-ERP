"use server";

import { revalidatePath } from "next/cache";
import { requireExpenseActor } from "@/features/finance/expense-authorization";
import { previewExpensePolicy, runExpensePolicyCommand } from "@/features/finance/expense-policy-repository";
import { normalizeExpensePolicyValues, validateExpensePolicy, type ExpensePolicyValues } from "@/features/finance/expense-policy-settings";

export async function createExpensePolicyDraftAction(input: {
  organizationId: string;
  id?: string;
  policy: ExpensePolicyValues;
  effectiveFrom: string;
  changeReason: string;
}) {
  const actor = await requireExpenseActor("ADMIN");
  assertOrganization(input.organizationId, actor.organization_id);
  const policy = normalizeExpensePolicyValues(input.policy);
  const errors = validateExpensePolicy(policy);
  if (errors.length) throw new Error(errors.join(" "));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) throw new Error("시행일을 확인해줘.");
  if (!input.changeReason.trim()) throw new Error("변경 사유를 입력해줘.");
  await runExpensePolicyCommand({
    actorId: actor.user_id,
    command: input.id ? "UPDATE_DRAFT" : "CREATE_DRAFT",
    data: { id: input.id, changeReason: input.changeReason.trim(), effectiveFrom: input.effectiveFrom, policy },
    organizationId: actor.organization_id,
  });
  revalidateSettings();
}

export async function transitionExpensePolicyAction(input: {
  organizationId: string;
  id: string;
  command: "SUBMIT" | "ACTIVATE" | "END";
}) {
  const actor = await requireExpenseActor("ADMIN");
  assertOrganization(input.organizationId, actor.organization_id);
  await runExpensePolicyCommand({ actorId: actor.user_id, command: input.command, data: { id: input.id }, organizationId: actor.organization_id });
  revalidateSettings();
}

export async function previewExpensePolicyAction(input: { organizationId: string; policy: ExpensePolicyValues }) {
  const actor = await requireExpenseActor("ADMIN");
  assertOrganization(input.organizationId, actor.organization_id);
  const policy = normalizeExpensePolicyValues(input.policy);
  const errors = validateExpensePolicy(policy);
  if (errors.length) throw new Error(errors.join(" "));
  return previewExpensePolicy(actor.organization_id, policy);
}

function assertOrganization(requested: string, actual: string) {
  if (requested !== actual) throw new Error("다른 조합의 운영 기준은 변경할 수 없어.");
}

function revalidateSettings() {
  revalidatePath("/finance/expense-settings");
  revalidatePath("/finance/expense-resolutions");
  revalidatePath("/finance/quick-expenses");
  revalidatePath("/finance/reimbursements");
}
