import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  meetingStatusForAmount,
  validateApprovalDraft,
  type ApprovalDocument,
  type ApprovalDraftInput,
  type ApprovalStep,
} from "./approval-domain";
import {
  createDefaultApprovalLines,
  type ExpenseResolution,
} from "@/features/finance/finance-model";
import { toManagedExpenseResolution } from "@/features/finance/expense-resolution-page";
import {
  getApprovalSettings,
  listMeetingRules,
} from "./approval-settings-repository";

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
  desired_execution_date: string | null;
  payment_due_date: string | null;
  project_name: string;
  is_urgent: boolean;
  evidence_kind: string | null;
  is_out_of_budget: boolean;
  has_member_burden: boolean;
  id: string;
  meeting_id: string | null;
  contract_id: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  contract_payment_terms: string | null;
  payment_schedule: Array<{
    amount: number;
    dueDate: string;
    memo: string;
  }> | null;
  recommended_meeting_body: string | null;
  recommendation_reason: string | null;
  regulation_reference: string | null;
  meeting_status: ApprovalDocument["meetingStatus"];
  purpose: string;
  reserved_amount: number | string;
  title: string;
  updated_at: string;
};

type StepRow = {
  acted_at: string | null;
  approver_label: string;
  approver_role: string;
  comment: string | null;
  document_id: string;
  status: ApprovalStep["status"];
  step_order: number;
};

function requireClient() {
  const client = getSupabaseServerClient();
  if (!client) throw new Error("Supabase 서버 연결이 설정되지 않았어.");
  return client;
}

type AuditRow = {
  action_type: string;
  actor_label: string;
  comment: string | null;
  created_at: string;
  document_id: string;
  id: string;
};
type AttachmentRow = {
  document_id: string;
  file_size: number;
  id: string;
  original_filename: string;
};
type ContractRow = {
  contract_amount: number | string;
  document_id: string;
  id: string;
  paid_amount: number | string;
};
type ContractPaymentRow = {
  contract_id: string;
  expense_resolution_id: string | null;
  id: string;
  paid_amount: number | string;
  requested_amount: number | string;
  scheduled_date: string | null;
  status: "SCHEDULED" | "REQUESTED" | "PAID" | "CANCELLED";
};
function hydrate(
  row: DocumentRow,
  steps: StepRow[],
  audits: AuditRow[] = [],
  attachments: AttachmentRow[] = [],
  contracts: ContractRow[] = [],
  contractPayments: ContractPaymentRow[] = [],
): ApprovalDocument {
  const contract = contracts.find((item) => item.document_id === row.id);
  const payments = contract
    ? contractPayments.filter((item) => item.contract_id === contract.id)
    : [];
  return {
    amount: Number(row.amount),
    approvalStatus: row.approval_status,
    approvalSteps: steps
      .filter((step) => step.document_id === row.id)
      .sort((a, b) => a.step_order - b.step_order)
      .map((step) => ({
        actedAt: step.acted_at ?? undefined,
        approverLabel: step.approver_label,
        approverRole: step.approver_role,
        comment: step.comment ?? undefined,
        order: step.step_order,
        status: step.status,
      })),
    body: row.body,
    budgetItem: row.budget_item ?? undefined,
    counterpartyName: row.counterparty_name ?? undefined,
    createdAt: row.created_at,
    departmentLabel: row.department_label,
    documentNo: row.document_no,
    documentType: row.document_type,
    drafterLabel: row.drafter_label,
    executionStatus: row.execution_status,
    expenseResolutionId: row.expense_resolution_id ?? undefined,
    id: row.id,
    meetingId: row.meeting_id ?? undefined,
    contractId: row.contract_id ?? undefined,
    contractStartDate: row.contract_start_date ?? undefined,
    contractEndDate: row.contract_end_date ?? undefined,
    contractPaymentTerms: row.contract_payment_terms ?? undefined,
    paymentSchedule: row.payment_schedule ?? [],
    meetingStatus: row.meeting_status,
    desiredExecutionDate: row.desired_execution_date ?? undefined,
    paymentDueDate: row.payment_due_date ?? undefined,
    projectName: row.project_name,
    isUrgent: row.is_urgent,
    evidenceKind: row.evidence_kind ?? undefined,
    isOutOfBudget: row.is_out_of_budget,
    hasMemberBurden: row.has_member_burden,
    recommendedMeetingBody: row.recommended_meeting_body ?? undefined,
    recommendationReason: row.recommendation_reason ?? undefined,
    regulationReference: row.regulation_reference ?? undefined,
    purpose: row.purpose,
    reservedAmount: Number(row.reserved_amount),
    title: row.title,
    updatedAt: row.updated_at,
    auditLogs: audits
      .filter((log) => log.document_id === row.id)
      .map((log) => ({
        actionType: log.action_type,
        actorLabel: log.actor_label,
        comment: log.comment ?? undefined,
        createdAt: log.created_at,
        id: log.id,
      })),
    attachments: attachments
      .filter((file) => file.document_id === row.id)
      .map((file) => ({
        fileName: file.original_filename,
        fileSize: file.file_size,
        id: file.id,
      })),
    contractAmount: contract ? Number(contract.contract_amount) : undefined,
    contractPaidAmount: contract ? Number(contract.paid_amount) : undefined,
    contractPayments: payments.map((item) => ({
      amount: Number(item.requested_amount),
      dueDate: item.scheduled_date ?? undefined,
      expenseResolutionId: item.expense_resolution_id ?? undefined,
      id: item.id,
      paidAmount: Number(item.paid_amount),
      status: item.status,
    })),
  };
}

export async function listApprovalDocuments(): Promise<ApprovalDocument[]> {
  const client = requireClient();
  const { data, error } = await client
    .schema("approval")
    .from("documents")
    .select("*")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`기안 목록을 불러오지 못했어: ${error.message}`);
  const rows = (data ?? []) as DocumentRow[];
  if (!rows.length) return [];
  const { data: stepData, error: stepError } = await client
    .schema("approval")
    .from("approval_steps")
    .select("*")
    .in(
      "document_id",
      rows.map((row) => row.id),
    );
  if (stepError)
    throw new Error(`결재선을 불러오지 못했어: ${stepError.message}`);
  const ids = rows.map((row) => row.id);
  const [auditResult, attachmentResult] = await Promise.all([
    client
      .schema("approval")
      .from("audit_logs")
      .select("id,document_id,action_type,actor_label,comment,created_at")
      .in("document_id", ids)
      .order("created_at", { ascending: false }),
    client
      .schema("approval")
      .from("attachments")
      .select("id,document_id,original_filename,file_size")
      .in("document_id", ids),
  ]);
  if (auditResult.error || attachmentResult.error)
    throw new Error(
      `기안 이력을 불러오지 못했어: ${auditResult.error?.message ?? attachmentResult.error?.message}`,
    );
  const contractResult = await client
    .schema("approval")
    .from("contracts")
    .select("id,document_id,contract_amount,paid_amount")
    .in("document_id", ids);
  if (contractResult.error)
    throw new Error(
      `계약 연결을 불러오지 못했어: ${contractResult.error.message}`,
    );
  const contracts = (contractResult.data ?? []) as ContractRow[];
  let payments: ContractPaymentRow[] = [];
  if (contracts.length) {
    const paymentResult = await client
      .schema("approval")
      .from("contract_payments")
      .select(
        "id,contract_id,scheduled_date,requested_amount,paid_amount,status,expense_resolution_id",
      )
      .in(
        "contract_id",
        contracts.map((item) => item.id),
      )
      .order("scheduled_date");
    if (paymentResult.error)
      throw new Error(
        `계약 지급일정을 불러오지 못했어: ${paymentResult.error.message}`,
      );
    payments = (paymentResult.data ?? []) as ContractPaymentRow[];
  }
  return rows.map((row) =>
    hydrate(
      row,
      (stepData ?? []) as StepRow[],
      (auditResult.data ?? []) as AuditRow[],
      (attachmentResult.data ?? []) as AttachmentRow[],
      contracts,
      payments,
    ),
  );
}

export async function getApprovalDocument(id: string) {
  const documents = await listApprovalDocuments();
  return documents.find((document) => document.id === id) ?? null;
}

export async function createApprovalDocument(
  input: ApprovalDraftInput,
  submit = false,
) {
  const client = requireClient();
  let effectiveInput = input;
  if (input.approvalLineRuleId) {
    const { data: rule, error: ruleError } = await client
      .schema("approval")
      .from("approval_line_rules")
      .select("document_type,min_amount,max_amount,steps")
      .eq("id", input.approvalLineRuleId)
      .eq("is_active", true)
      .maybeSingle();
    if (ruleError || !rule)
      throw new Error("선택한 결재선 규칙을 찾지 못했어.");
    if (rule.document_type && rule.document_type !== input.documentType)
      throw new Error("문서유형과 결재선 규칙이 맞지 않아.");
    if (
      input.amount < Number(rule.min_amount) ||
      (rule.max_amount !== null && input.amount > Number(rule.max_amount))
    )
      throw new Error("기안금액이 결재선 규칙 범위를 벗어났어.");
    effectiveInput = { ...input, approvalSteps: rule.steps };
  }
  validateApprovalDraft(effectiveInput);
  const scheduleTotal = (effectiveInput.paymentSchedule ?? []).reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  if (
    effectiveInput.documentType === "CONTRACT" &&
    effectiveInput.installmentPayment &&
    scheduleTotal !== effectiveInput.amount
  )
    throw new Error("분할지급 일정 합계와 계약금액이 일치해야 해.");
  const [settings, rules] = await Promise.all([
    getApprovalSettings(),
    listMeetingRules(),
  ]);
  const searchable = `${effectiveInput.title} ${effectiveInput.purpose} ${effectiveInput.body}`;
  const matchedRule = rules.find(
    (rule) => rule.is_active && searchable.includes(rule.keyword),
  );
  const recommendedBody =
    matchedRule?.recommended_body ??
    (effectiveInput.amount >= settings.meetingThresholdAmount
      ? "BOARD"
      : undefined);
  const document = {
    ...effectiveInput,
    meetingStatus:
      effectiveInput.finalMeetingBody || recommendedBody
        ? "REQUIRED"
        : meetingStatusForAmount(
            effectiveInput.amount,
            settings.meetingThresholdAmount,
          ),
  };
  const { data, error } = await client
    .schema("approval")
    .rpc("create_document", {
      p_document: document,
      p_lines: effectiveInput.lines ?? [],
      p_steps: effectiveInput.approvalSteps,
      p_submit: submit,
    });
  if (error) throw new Error(`기안을 저장하지 못했어: ${error.message}`);
  if (recommendedBody) {
    const { error: recommendationError } = await client
      .schema("approval")
      .from("documents")
      .update({
        recommended_meeting_body: recommendedBody,
        recommendation_reason:
          matchedRule?.reason ??
          `${settings.meetingThresholdAmount.toLocaleString("ko-KR")}원 이상 금액 기준`,
        regulation_reference: matchedRule?.regulation_reference || null,
      })
      .eq("id", data);
    if (recommendationError)
      throw new Error(
        `의결기관 추천을 저장하지 못했어: ${recommendationError.message}`,
      );
  }
  if (effectiveInput.documentType === "CONTRACT") {
    const { error: contractError } = await client
      .schema("approval")
      .from("documents")
      .update({
        contract_end_date: effectiveInput.contractEndDate || null,
        contract_payment_terms: effectiveInput.contractPaymentTerms || null,
        contract_start_date: effectiveInput.contractStartDate || null,
        payment_schedule: effectiveInput.paymentSchedule ?? [],
      })
      .eq("id", data);
    if (contractError)
      throw new Error(`계약조건을 저장하지 못했어: ${contractError.message}`);
  }
  return data as string;
}

export async function uploadApprovalAttachment(
  documentId: string,
  file: File,
  actorLabel: string,
) {
  if (!file.size) return;
  if (file.size > 10 * 1024 * 1024)
    throw new Error("첨부파일은 10MB 이하여야 해.");
  const client = requireClient();
  const path = `${documentId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.가-힣-]/g, "_")}`;
  const { error: uploadError } = await client.storage
    .from("approval-attachments")
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError)
    throw new Error(`첨부파일 업로드 실패: ${uploadError.message}`);
  const { error } = await client
    .schema("approval")
    .from("attachments")
    .insert({
      content_type: file.type || "application/octet-stream",
      document_id: documentId,
      file_size: file.size,
      original_filename: file.name,
      storage_bucket: "approval-attachments",
      storage_path: path,
      uploaded_by_label: actorLabel,
    });
  if (error)
    throw new Error(`첨부파일 정보를 저장하지 못했어: ${error.message}`);
  await client
    .schema("approval")
    .from("audit_logs")
    .insert({
      action_type: "ATTACHMENT_ADDED",
      actor_label: actorLabel,
      after_data: { fileName: file.name, fileSize: file.size },
      document_id: documentId,
    });
}

export async function createApprovalAttachmentDownloadUrl(
  attachmentId: string,
) {
  const client = requireClient();
  const { data: attachment, error } = await client
    .schema("approval")
    .from("attachments")
    .select("storage_bucket,storage_path")
    .eq("id", attachmentId)
    .maybeSingle();
  if (error || !attachment) throw new Error("첨부파일을 찾지 못했어.");
  const { data, error: signedUrlError } = await client.storage
    .from(attachment.storage_bucket)
    .createSignedUrl(attachment.storage_path, 60);
  if (signedUrlError || !data?.signedUrl)
    throw new Error("첨부파일 열기 주소를 만들지 못했어.");
  return data.signedUrl;
}

export async function decideApprovalDocument(
  id: string,
  actorLabel: string,
  decision: "APPROVE" | "REJECT",
  comment?: string,
) {
  const document = await getApprovalDocument(id);
  if (
    !document ||
    !["SUBMITTED", "IN_REVIEW"].includes(document.approvalStatus)
  )
    throw new Error("결재 가능한 문서가 아니야.");
  const current = document.approvalSteps.find(
    (step) => step.status === "PENDING",
  );
  if (!current || current.approverLabel !== actorLabel)
    throw new Error("현재 결재자만 처리할 수 있어.");
  if (decision === "REJECT" && !comment?.trim())
    throw new Error("반려 사유를 입력해줘.");
  const client = requireClient();
  const { error } = await client
    .schema("approval")
    .rpc("decide_document", {
      p_actor_label: actorLabel,
      p_comment: comment || null,
      p_decision: decision,
      p_document_id: id,
    });
  if (error) throw new Error(`결재 상태를 저장하지 못했어: ${error.message}`);
}

export async function createExpenseDraftFromApproval(
  id: string,
  actorLabel: string,
) {
  const document = await getApprovalDocument(id);
  if (!document) throw new Error("기안 문서를 찾지 못했어.");
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Seoul",
  });
  const base: ExpenseResolution = {
    accountHolder: document.counterpartyName ?? "미지정",
    accountNumber: "",
    approvalLines: createDefaultApprovalLines(),
    approvalStatus: "DRAFT",
    bankName: "미지정",
    budgetItem: document.budgetItem ?? "미지정",
    createdAt: today,
    createdBy: document.drafterLabel,
    createdByTitle: document.departmentLabel,
    evidenceFiles: [],
    expenseType: document.budgetItem ?? "기타",
    history: [
      {
        actionAt: `${today} 00:00`,
        actionLabel: `기안 ${document.documentNo}에서 생성`,
        actionType: "CREATED",
        actorName: actorLabel,
        actorTitle: "",
        id: `approval-${id}`,
      },
    ],
    id: `approval-expense-${id}`,
    paymentStatus: "BEFORE_PAYMENT",
    plannedPaymentDate: today,
    projectName: "",
    reason: document.purpose,
    resolutionNo: "생성중",
    settlementStatus: "NOT_REQUIRED",
    subject: document.title,
    supplyAmount: document.amount,
    totalAmount: document.amount,
    vatAmount: 0,
    vendorName: document.counterpartyName ?? "미지정",
  };
  const client = requireClient();
  const { data, error } = await client
    .schema("approval")
    .rpc("create_expense_draft", {
      p_actor_label: actorLabel,
      p_document_id: id,
      p_resolution_data: toManagedExpenseResolution(base),
    });
  if (error)
    throw new Error(`지출결의서 초안을 만들지 못했어: ${error.message}`);
  return data as string;
}

export async function createMeetingAgenda(
  id: string,
  actorLabel: string,
  meetingBody: "BOARD" | "DELEGATES" | "GENERAL_ASSEMBLY",
) {
  const { error } = await requireClient()
    .schema("approval")
    .rpc("create_meeting_agenda", {
      p_actor_label: actorLabel,
      p_document_id: id,
      p_meeting_body: meetingBody,
    });
  if (error) throw new Error(`회의 안건을 만들지 못했어: ${error.message}`);
}

export async function decideMeetingAgenda(input: {
  actorLabel: string;
  agendaNo: string;
  conditions?: string;
  documentId: string;
  meetingDate: string;
  result: "APPROVED" | "REJECTED" | "DEFERRED";
  round: string;
}) {
  const { error } = await requireClient()
    .schema("approval")
    .rpc("decide_meeting_agenda", {
      p_actor_label: input.actorLabel,
      p_agenda_no: input.agendaNo,
      p_conditions: input.conditions || null,
      p_document_id: input.documentId,
      p_meeting_date: input.meetingDate,
      p_result: input.result,
      p_round: input.round,
    });
  if (error) throw new Error(`의결 결과를 저장하지 못했어: ${error.message}`);
}

export async function createContractFromApproval(
  id: string,
  actorLabel: string,
  paymentTerms: string,
) {
  const { error } = await requireClient()
    .schema("approval")
    .rpc("create_contract", {
      p_actor_label: actorLabel,
      p_document_id: id,
      p_payment_terms: paymentTerms,
    });
  if (error) throw new Error(`계약을 연결하지 못했어: ${error.message}`);
}

export async function createContractPaymentExpense(
  documentId: string,
  paymentId: string,
  actorLabel: string,
) {
  const document = await getApprovalDocument(documentId);
  const payment = document?.contractPayments?.find(
    (item) => item.id === paymentId,
  );
  if (!document || !payment)
    throw new Error("계약 분할지급 일정을 찾지 못했어.");
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Seoul",
  });
  const base: ExpenseResolution = {
    accountHolder: document.counterpartyName ?? "미지정",
    accountNumber: "",
    approvalLines: createDefaultApprovalLines(),
    approvalStatus: "DRAFT",
    bankName: "미지정",
    budgetItem: document.budgetItem ?? "미지정",
    createdAt: today,
    createdBy: actorLabel,
    createdByTitle: "계약담당",
    evidenceFiles: [],
    expenseType: document.budgetItem ?? "계약비",
    history: [],
    id: `contract-payment-${paymentId}`,
    paymentStatus: "BEFORE_PAYMENT",
    plannedPaymentDate: payment.dueDate ?? today,
    projectName: document.projectName,
    reason: `기안 ${document.documentNo} 계약 분할지급`,
    resolutionNo: "생성중",
    settlementStatus: "NOT_REQUIRED",
    subject: `${document.title} 분할지급`,
    supplyAmount: payment.amount,
    totalAmount: payment.amount,
    vatAmount: 0,
    vendorName: document.counterpartyName ?? "미지정",
  };
  const { data, error } = await requireClient()
    .schema("approval")
    .rpc("create_contract_payment_expense", {
      p_actor_label: actorLabel,
      p_payment_id: paymentId,
      p_resolution_data: toManagedExpenseResolution(base),
    });
  if (error)
    throw new Error(`분할지급 지출결의서를 만들지 못했어: ${error.message}`);
  return data as string;
}

export async function updateApprovalDocument(
  id: string,
  actorLabel: string,
  changes: {
    amount?: number;
    budgetItem?: string;
    counterpartyName?: string;
    projectName?: string;
    title?: string;
  },
) {
  const { error } = await requireClient()
    .schema("approval")
    .rpc("update_document", {
      p_actor_label: actorLabel,
      p_changes: changes,
      p_document_id: id,
    });
  if (error) throw new Error(`기안을 수정하지 못했어: ${error.message}`);
}

export async function closeApprovalDocument(
  id: string,
  actorLabel: string,
  action: "WITHDRAWN" | "CANCELLED",
  reason: string,
) {
  if (!reason.trim()) throw new Error("회수·취소 사유를 입력해줘.");
  const { error } = await requireClient()
    .schema("approval")
    .rpc("release_reservation", {
      p_action: action,
      p_actor_label: actorLabel,
      p_document_id: id,
      p_reason: reason,
    });
  if (error)
    throw new Error(
      `문서를 ${action === "WITHDRAWN" ? "회수" : "취소"}하지 못했어: ${error.message}`,
    );
}

export type ApprovalBudgetSummary = {
  approved: number;
  available: number;
  executed: number;
  reserved: number;
};
export async function getApprovalBudgetSummary(): Promise<ApprovalBudgetSummary> {
  const client = requireClient();
  const [budgets, reservations] = await Promise.all([
    client
      .schema("approval")
      .from("budgets")
      .select("approved_amount,executed_amount"),
    client
      .schema("approval")
      .from("budget_reservations")
      .select("amount,released_amount")
      .eq("status", "ACTIVE"),
  ]);
  if (budgets.error || reservations.error)
    throw new Error(
      `예산 현황을 불러오지 못했어: ${budgets.error?.message ?? reservations.error?.message}`,
    );
  const approved = (budgets.data ?? []).reduce(
    (sum, row) => sum + Number(row.approved_amount),
    0,
  );
  const executed = (budgets.data ?? []).reduce(
    (sum, row) => sum + Number(row.executed_amount),
    0,
  );
  const reserved = (reservations.data ?? []).reduce(
    (sum, row) => sum + Number(row.amount) - Number(row.released_amount),
    0,
  );
  return {
    approved,
    executed,
    reserved,
    available: approved - executed - reserved,
  };
}
