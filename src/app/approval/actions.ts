"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { closeApprovalDocument, createApprovalDocument, createContractFromApproval, createExpenseDraftFromApproval, createMeetingAgenda, decideApprovalDocument, decideMeetingAgenda, updateApprovalDocument, uploadApprovalAttachment } from "@/features/approval/approval-repository";
import type { ApprovalDocumentType } from "@/features/approval/approval-domain";

function text(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }

export async function createApprovalAction(formData: FormData) {
  const lines = [1, 2, 3].map((index) => ({ accountSubjectName: text(formData, `accountSubject${index}`), budgetItem: text(formData, `lineBudgetItem${index}`), description: text(formData, `lineDescription${index}`), partnerName: text(formData, `linePartner${index}`), supplyAmount: Number(text(formData, `supplyAmount${index}`)) || 0, vatAmount: Number(text(formData, `vatAmount${index}`)) || 0 })).filter((line) => line.partnerName || line.accountSubjectName || line.supplyAmount || line.vatAmount);
  const draft = {
    amount: Number(text(formData, "amount")) || 0,
    approvalSteps: [
      { approverLabel: text(formData, "approver1"), approverRole: text(formData, "approverRole1") },
      ...(text(formData, "approver2") ? [{ approverLabel: text(formData, "approver2"), approverRole: text(formData, "approverRole2") }] : []),
    ],
    body: text(formData, "body"), budgetItem: text(formData, "budgetItem") || undefined,
    counterpartyName: text(formData, "counterpartyName") || undefined, departmentLabel: text(formData, "departmentLabel"),
    documentType: text(formData, "documentType") as ApprovalDocumentType, drafterLabel: text(formData, "drafterLabel"),
    purpose: text(formData, "purpose"), title: text(formData, "title"), lines,
    contractRelated: formData.get("contractRelated") === "on", desiredExecutionDate: text(formData, "desiredExecutionDate"), evidenceKind: text(formData, "evidenceKind"), expectedEffect: text(formData, "expectedEffect"), finalMeetingBody: text(formData, "finalMeetingBody"), fiscalYear: Number(text(formData, "fiscalYear")) || undefined, installmentPayment: formData.get("installmentPayment") === "on", meetingConfirmed: formData.get("meetingConfirmed") === "on", memberBurden: formData.get("memberBurden") === "on", outOfBudget: formData.get("outOfBudget") === "on", paymentDueDate: text(formData, "paymentDueDate"), paymentMethod: text(formData, "paymentMethod"), projectName: text(formData, "projectName"), relatedDocument: text(formData, "relatedDocument"), securityLevel: (text(formData, "securityLevel") || "INTERNAL") as "PUBLIC" | "INTERNAL" | "CONFIDENTIAL", urgent: formData.get("urgent") === "on",
  };
  const id = await createApprovalDocument(draft, text(formData, "intent") === "submit");
  const attachment = formData.get("attachment");
  if (attachment instanceof File && attachment.size) await uploadApprovalAttachment(id, attachment, draft.drafterLabel);
  revalidatePath("/approval");
  redirect(`/approval/${id}`);
}

export async function decideApprovalAction(formData: FormData) {
  const id = text(formData, "id");
  await decideApprovalDocument(id, text(formData, "actorLabel"), text(formData, "decision") as "APPROVE" | "REJECT", text(formData, "comment"));
  revalidatePath("/approval"); revalidatePath(`/approval/${id}`);
}

export async function createLinkedExpenseAction(formData: FormData) {
  const id = text(formData, "id");
  await createExpenseDraftFromApproval(id, text(formData, "actorLabel"));
  revalidatePath(`/approval/${id}`); revalidatePath("/finance/exp");
  redirect("/finance/exp");
}

export async function createMeetingAgendaAction(formData: FormData) {
  const id = text(formData, "id");
  await createMeetingAgenda(id, text(formData, "actorLabel"), text(formData, "meetingBody") as "BOARD" | "DELEGATES" | "GENERAL_ASSEMBLY");
  revalidatePath(`/approval/${id}`);
}

export async function decideMeetingAgendaAction(formData: FormData) {
  const id = text(formData, "id");
  await decideMeetingAgenda({ actorLabel: text(formData, "actorLabel"), agendaNo: text(formData, "agendaNo"), conditions: text(formData, "conditions"), documentId: id, meetingDate: text(formData, "meetingDate"), result: text(formData, "result") as "APPROVED" | "REJECTED" | "DEFERRED", round: text(formData, "round") });
  revalidatePath(`/approval/${id}`); revalidatePath("/approval");
}

export async function createContractAction(formData: FormData) {
  const id = text(formData, "id");
  await createContractFromApproval(id, text(formData, "actorLabel"), text(formData, "paymentTerms"));
  revalidatePath(`/approval/${id}`);
}

export async function updateApprovalAction(formData: FormData) {
  const id=text(formData,"id"); await updateApprovalDocument(id,text(formData,"actorLabel"),{amount:Number(text(formData,"amount")),budgetItem:text(formData,"budgetItem"),counterpartyName:text(formData,"counterpartyName"),projectName:text(formData,"projectName"),title:text(formData,"title")}); revalidatePath(`/approval/${id}`);revalidatePath("/approval");
}
export async function closeApprovalAction(formData: FormData) {
  const id=text(formData,"id");await closeApprovalDocument(id,text(formData,"actorLabel"),text(formData,"action") as "WITHDRAWN"|"CANCELLED",text(formData,"reason"));revalidatePath(`/approval/${id}`);revalidatePath("/approval");
}
