import { getSupabaseServerClient } from "@/lib/supabase/server";
import { meetingStatusForAmount, validateApprovalDraft, type ApprovalDocument, type ApprovalDraftInput, type ApprovalStep } from "./approval-domain";
import { createDefaultApprovalLines, type ExpenseResolution } from "@/features/finance/finance-model";
import { toManagedExpenseResolution } from "@/features/finance/expense-resolution-page";

type DocumentRow = {
  amount: number | string;
  approval_status: ApprovalDocument["approvalStatus"];
  body: string;
  budget_item: string | null;
  counterparty_name: string | null;
  created_at: string;
  department_label: string;
  document_no: string;
  document_type: ApprovalDocument["documentType"];
  drafter_label: string;
  execution_status: ApprovalDocument["executionStatus"];
  expense_resolution_id: string | null;
  id: string;
  meeting_id: string | null;
  contract_id: string | null;
  meeting_status: ApprovalDocument["meetingStatus"];
  purpose: string;
  reserved_amount: number | string;
  title: string;
  updated_at: string;
};

type StepRow = { acted_at: string | null; approver_label: string; approver_role: string; comment: string | null; document_id: string; status: ApprovalStep["status"]; step_order: number };

function requireClient() {
  const client = getSupabaseServerClient();
  if (!client) throw new Error("Supabase 서버 연결이 설정되지 않았어.");
  return client;
}

type AuditRow = { action_type: string; actor_label: string; comment: string | null; created_at: string; document_id: string; id: string };
type AttachmentRow = { document_id: string; file_size: number; id: string; original_filename: string };
function hydrate(row: DocumentRow, steps: StepRow[], audits: AuditRow[] = [], attachments: AttachmentRow[] = []): ApprovalDocument {
  return {
    amount: Number(row.amount), approvalStatus: row.approval_status,
    approvalSteps: steps.filter((step) => step.document_id === row.id).sort((a, b) => a.step_order - b.step_order).map((step) => ({ actedAt: step.acted_at ?? undefined, approverLabel: step.approver_label, approverRole: step.approver_role, comment: step.comment ?? undefined, order: step.step_order, status: step.status })),
    body: row.body, budgetItem: row.budget_item ?? undefined, counterpartyName: row.counterparty_name ?? undefined,
    createdAt: row.created_at, departmentLabel: row.department_label, documentNo: row.document_no, documentType: row.document_type,
    drafterLabel: row.drafter_label, executionStatus: row.execution_status, expenseResolutionId: row.expense_resolution_id ?? undefined,
    id: row.id, meetingId: row.meeting_id ?? undefined, contractId: row.contract_id ?? undefined, meetingStatus: row.meeting_status,
    purpose: row.purpose, reservedAmount: Number(row.reserved_amount), title: row.title, updatedAt: row.updated_at,
    auditLogs: audits.filter((log) => log.document_id === row.id).map((log) => ({ actionType: log.action_type, actorLabel: log.actor_label, comment: log.comment ?? undefined, createdAt: log.created_at, id: log.id })),
    attachments: attachments.filter((file) => file.document_id === row.id).map((file) => ({ fileName: file.original_filename, fileSize: file.file_size, id: file.id })),
  };
}

export async function listApprovalDocuments(): Promise<ApprovalDocument[]> {
  const client = requireClient();
  const { data, error } = await client.schema("approval").from("documents").select("*").is("deleted_at", null).order("updated_at", { ascending: false });
  if (error) throw new Error(`기안 목록을 불러오지 못했어: ${error.message}`);
  const rows = (data ?? []) as DocumentRow[];
  if (!rows.length) return [];
  const { data: stepData, error: stepError } = await client.schema("approval").from("approval_steps").select("*").in("document_id", rows.map((row) => row.id));
  if (stepError) throw new Error(`결재선을 불러오지 못했어: ${stepError.message}`);
  const ids = rows.map((row) => row.id);
  const [auditResult, attachmentResult] = await Promise.all([
    client.schema("approval").from("audit_logs").select("id,document_id,action_type,actor_label,comment,created_at").in("document_id", ids).order("created_at", { ascending: false }),
    client.schema("approval").from("attachments").select("id,document_id,original_filename,file_size").in("document_id", ids),
  ]);
  if (auditResult.error || attachmentResult.error) throw new Error(`기안 이력을 불러오지 못했어: ${auditResult.error?.message ?? attachmentResult.error?.message}`);
  return rows.map((row) => hydrate(row, (stepData ?? []) as StepRow[], (auditResult.data ?? []) as AuditRow[], (attachmentResult.data ?? []) as AttachmentRow[]));
}

export async function getApprovalDocument(id: string) {
  const documents = await listApprovalDocuments();
  return documents.find((document) => document.id === id) ?? null;
}

export async function createApprovalDocument(input: ApprovalDraftInput, submit = false) {
  validateApprovalDraft(input);
  const client = requireClient();
  const document = { ...input, meetingStatus: input.finalMeetingBody ? "REQUIRED" : meetingStatusForAmount(input.amount) };
  const { data, error } = await client.schema("approval").rpc("create_document", { p_document: document, p_lines: input.lines ?? [], p_steps: input.approvalSteps, p_submit: submit });
  if (error) throw new Error(`기안을 저장하지 못했어: ${error.message}`);
  return data as string;
}

export async function uploadApprovalAttachment(documentId: string, file: File, actorLabel: string) {
  if (!file.size) return;
  if (file.size > 10 * 1024 * 1024) throw new Error("첨부파일은 10MB 이하여야 해.");
  const client = requireClient();
  const path = `${documentId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.가-힣-]/g, "_")}`;
  const { error: uploadError } = await client.storage.from("approval-attachments").upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
  if (uploadError) throw new Error(`첨부파일 업로드 실패: ${uploadError.message}`);
  const { error } = await client.schema("approval").from("attachments").insert({ content_type: file.type || "application/octet-stream", document_id: documentId, file_size: file.size, original_filename: file.name, storage_bucket: "approval-attachments", storage_path: path, uploaded_by_label: actorLabel });
  if (error) throw new Error(`첨부파일 정보를 저장하지 못했어: ${error.message}`);
  await client.schema("approval").from("audit_logs").insert({ action_type: "ATTACHMENT_ADDED", actor_label: actorLabel, after_data: { fileName: file.name, fileSize: file.size }, document_id: documentId });
}

export async function decideApprovalDocument(id: string, actorLabel: string, decision: "APPROVE" | "REJECT", comment?: string) {
  const document = await getApprovalDocument(id);
  if (!document || !["SUBMITTED", "IN_REVIEW"].includes(document.approvalStatus)) throw new Error("결재 가능한 문서가 아니야.");
  const current = document.approvalSteps.find((step) => step.status === "PENDING");
  if (!current || current.approverLabel !== actorLabel) throw new Error("현재 결재자만 처리할 수 있어.");
  if (decision === "REJECT" && !comment?.trim()) throw new Error("반려 사유를 입력해줘.");
  const client = requireClient();
  const { error } = await client.schema("approval").rpc("decide_document", { p_actor_label: actorLabel, p_comment: comment || null, p_decision: decision, p_document_id: id });
  if (error) throw new Error(`결재 상태를 저장하지 못했어: ${error.message}`);
}

export async function createExpenseDraftFromApproval(id: string, actorLabel: string) {
  const document = await getApprovalDocument(id);
  if (!document) throw new Error("기안 문서를 찾지 못했어.");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  const base: ExpenseResolution = {
    accountHolder: document.counterpartyName ?? "미지정", accountNumber: "", approvalLines: createDefaultApprovalLines(), approvalStatus: "DRAFT",
    bankName: "미지정", budgetItem: document.budgetItem ?? "미지정", createdAt: today, createdBy: document.drafterLabel,
    createdByTitle: document.departmentLabel, evidenceFiles: [], expenseType: document.budgetItem ?? "기타",
    history: [{ actionAt: `${today} 00:00`, actionLabel: `기안 ${document.documentNo}에서 생성`, actionType: "CREATED", actorName: actorLabel, actorTitle: "", id: `approval-${id}` }],
    id: `approval-expense-${id}`, paymentStatus: "BEFORE_PAYMENT", plannedPaymentDate: today, projectName: "", reason: document.purpose,
    resolutionNo: "생성중", settlementStatus: "NOT_REQUIRED", subject: document.title, supplyAmount: document.amount,
    totalAmount: document.amount, vatAmount: 0, vendorName: document.counterpartyName ?? "미지정",
  };
  const client = requireClient();
  const { data, error } = await client.schema("approval").rpc("create_expense_draft", { p_actor_label: actorLabel, p_document_id: id, p_resolution_data: toManagedExpenseResolution(base) });
  if (error) throw new Error(`지출결의서 초안을 만들지 못했어: ${error.message}`);
  return data as string;
}

export async function createMeetingAgenda(id: string, actorLabel: string, meetingBody: "BOARD" | "DELEGATES" | "GENERAL_ASSEMBLY") {
  const { error } = await requireClient().schema("approval").rpc("create_meeting_agenda", { p_actor_label: actorLabel, p_document_id: id, p_meeting_body: meetingBody });
  if (error) throw new Error(`회의 안건을 만들지 못했어: ${error.message}`);
}

export async function decideMeetingAgenda(input: { actorLabel: string; agendaNo: string; conditions?: string; documentId: string; meetingDate: string; result: "APPROVED" | "REJECTED" | "DEFERRED"; round: string }) {
  const { error } = await requireClient().schema("approval").rpc("decide_meeting_agenda", { p_actor_label: input.actorLabel, p_agenda_no: input.agendaNo, p_conditions: input.conditions || null, p_document_id: input.documentId, p_meeting_date: input.meetingDate, p_result: input.result, p_round: input.round });
  if (error) throw new Error(`의결 결과를 저장하지 못했어: ${error.message}`);
}

export async function createContractFromApproval(id: string, actorLabel: string, paymentTerms: string) {
  const { error } = await requireClient().schema("approval").rpc("create_contract", { p_actor_label: actorLabel, p_document_id: id, p_payment_terms: paymentTerms });
  if (error) throw new Error(`계약을 연결하지 못했어: ${error.message}`);
}

export async function updateApprovalDocument(id: string, actorLabel: string, changes: { amount?: number; budgetItem?: string; counterpartyName?: string; projectName?: string; title?: string }) {
  const { error } = await requireClient().schema("approval").rpc("update_document", { p_actor_label: actorLabel, p_changes: changes, p_document_id: id });
  if (error) throw new Error(`기안을 수정하지 못했어: ${error.message}`);
}

export async function closeApprovalDocument(id: string, actorLabel: string, action: "WITHDRAWN" | "CANCELLED", reason: string) {
  if (!reason.trim()) throw new Error("회수·취소 사유를 입력해줘.");
  const { error } = await requireClient().schema("approval").rpc("release_reservation", { p_action: action, p_actor_label: actorLabel, p_document_id: id, p_reason: reason });
  if (error) throw new Error(`문서를 ${action === "WITHDRAWN" ? "회수" : "취소"}하지 못했어: ${error.message}`);
}

export type ApprovalBudgetSummary = { approved: number; available: number; executed: number; reserved: number };
export async function getApprovalBudgetSummary(): Promise<ApprovalBudgetSummary> {
  const client=requireClient(); const [budgets,reservations]=await Promise.all([client.schema("approval").from("budgets").select("approved_amount,executed_amount"),client.schema("approval").from("budget_reservations").select("amount,released_amount").eq("status","ACTIVE")]);
  if(budgets.error||reservations.error)throw new Error(`예산 현황을 불러오지 못했어: ${budgets.error?.message??reservations.error?.message}`);
  const approved=(budgets.data??[]).reduce((sum,row)=>sum+Number(row.approved_amount),0);const executed=(budgets.data??[]).reduce((sum,row)=>sum+Number(row.executed_amount),0);const reserved=(reservations.data??[]).reduce((sum,row)=>sum+Number(row.amount)-Number(row.released_amount),0);return{approved,executed,reserved,available:approved-executed-reserved};
}
