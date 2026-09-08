"use server";
import { revalidatePath } from "next/cache";
import { commitApprovalCommand, requireApprovalActor } from "@/features/approval/approval-authorization";

export async function bindApprovalAuthorization(input: { id: string; version: number; author: string; steps: { order: number; user_id: string }[]; reason: string; key: string }) {
  await requireApprovalActor("ADMIN");
  if (!input.reason.trim()) throw new Error("계정 연결 확인 근거가 필요합니다.");
  await commitApprovalCommand("BIND", input.id, { drafter_user_id: input.author, steps: input.steps, reason: input.reason }, { expectedVersion: input.version, key: input.key });
  revalidatePath("/approval/authorizations"); revalidatePath("/approval"); revalidatePath(`/approval/${input.id}`);
}
