import { requireApprovalActor, requireApprovalRecord, commitApprovalCommand, missingApprovalBinding, type ApprovalAuthorization, type ApprovalCommandContext } from "./approval-authorization";
import { listApprovalBudgets } from "./approval-settings-repository";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  meetingStatusForAmount,
  validateApprovalDraft,
  type ApprovalDocument,
  type ApprovalDocumentCandidate,
  type ApprovalDraftInput,
  type ApprovalExecutionLink,
  type ApprovalStep,
} from "./approval-domain";
import {
  createDefaultApprovalLines,
  type ExpenseResolution,
} from "@/features/finance/finance-model";
import { toManagedExpenseResolutionDraft } from "@/features/finance/expense-resolution-draft-adapter";
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
type ExecutionLinkRow = {
  contract_payment_id: string | null;
  document_id: string;
  execution_kind: ApprovalExecutionLink["kind"];
  expense_resolution_id: string;
  id: string;
  status: ApprovalExecutionLink["status"];
  workflow_transaction_id: string | null;
};
function hydrate(
  row: DocumentRow,
  steps: StepRow[],
  audits: AuditRow[] = [],
  attachments: AttachmentRow[] = [],
  contracts: ContractRow[] = [],
  contractPayments: ContractPaymentRow[] = [],
  executionLinks: ExecutionLinkRow[] = [],
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
    executionLinks: executionLinks
      .filter((item) => item.document_id === row.id)
      .map((item) => ({
        contractPaymentId: item.contract_payment_id ?? undefined,
        expenseResolutionId: item.expense_resolution_id,
        id: item.id,
        kind: item.execution_kind,
        status: item.status,
        workflowTransactionId: item.workflow_transaction_id ?? undefined,
      })),
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

export async function listApprovalDocuments(organizationId?: string, documentId?: string): Promise<ApprovalDocument[]> {
  const actor = await requireApprovalActor();
  if (organizationId && organizationId !== actor.organization_id) throw new Error("다른 조합의 기안을 조회할 수 없습니다.");
  const client = requireClient();
  let query = client
    .schema("approval")
    .from("documents")
    .select("*")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  query = query.eq("organization_id", actor.organization_id);
  if (documentId) query = query.eq("id", documentId);
  const { data, error } = await query;
  if (error) throw new Error(`기안 목록을 불러오지 못했어: ${error.message}`);
  const rows = (data ?? []) as DocumentRow[];
  if (!rows.length) return [];
  const { data: bindingRows, error: bindingError } = await client.schema("approval").from("document_authorization_bindings")
    .select("document_id,drafter_user_id,steps,version").eq("organization_id", actor.organization_id).in("document_id", rows.map(row => row.id));
  if (bindingError && !missingApprovalBinding(bindingError)) throw new Error("기안 계정 연결을 불러오지 못했습니다.");
  const bindings = new Map(((bindingRows ?? []) as (ApprovalAuthorization & { document_id: string })[]).map(b => [b.document_id, b]));
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
  const [auditResult, attachmentResult, executionLinkResult] = await Promise.all([
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
    client
      .schema("approval")
      .from("document_execution_links")
      .select("id,document_id,execution_kind,contract_payment_id,expense_resolution_id,workflow_transaction_id,status")
      .in("document_id", ids)
      .order("created_at"),
  ]);
  if (auditResult.error || attachmentResult.error || executionLinkResult.error)
    throw new Error(
      `기안 이력을 불러오지 못했어: ${auditResult.error?.message ?? attachmentResult.error?.message ?? executionLinkResult.error?.message}`,
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
  return rows.map((row) => ({
    ...hydrate(
      row,
      (stepData ?? []) as StepRow[],
      (auditResult.data ?? []) as AuditRow[],
      (attachmentResult.data ?? []) as AttachmentRow[],
      contracts,
      payments,
      (executionLinkResult.data ?? []) as ExecutionLinkRow[],
    ), authorization: bindings.get(row.id) ?? null,
  }));
}

export async function listApprovedApprovalDocumentCandidates(
  organizationId?: string,
  limit = 50,
): Promise<ApprovalDocumentCandidate[]> {
  const actor = await requireApprovalActor();
  if (organizationId && organizationId !== actor.organization_id) throw new Error("다른 조합의 기안을 조회할 수 없습니다.");
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const { data, error } = await requireClient()
    .schema("approval")
    .from("documents")
    .select("id,document_no,title,counterparty_name,project_name,budget_item,amount,approval_status,is_out_of_budget,meeting_status,execution_status")
    .eq("organization_id", actor.organization_id)
    .eq("approval_status", "APPROVED")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(boundedLimit);
  if (error) throw new Error(`승인된 기안 후보를 불러오지 못했어: ${error.message}`);
  const rows = (data ?? []) as Pick<DocumentRow, "amount" | "approval_status" | "budget_item" | "counterparty_name" | "document_no" | "execution_status" | "id" | "is_out_of_budget" | "meeting_status" | "project_name" | "title">[];
  const documentIds = rows.map((row) => row.id);
  const reservationResult = documentIds.length
    ? await requireClient().schema("approval").from("budget_reservations").select("document_id,amount,released_amount,status").in("document_id", documentIds)
    : { data: [], error: null };
  if (reservationResult.error) throw new Error(`기안 예산예약을 불러오지 못했어: ${reservationResult.error.message}`);
  const activeReservedAmounts = new Map<string, number>();
  for (const reservation of (reservationResult.data ?? []) as Array<{ amount: number; document_id: string; released_amount: number; status: string }>) {
    if (reservation.status !== "ACTIVE") continue;
    activeReservedAmounts.set(reservation.document_id, (activeReservedAmounts.get(reservation.document_id) ?? 0) + Math.max(0, Number(reservation.amount) - Number(reservation.released_amount)));
  }
  return rows.map((row) => ({
    amount: Number(row.amount),
    approvalStatus: row.approval_status,
    budgetItem: row.budget_item ?? undefined,
    counterpartyName: row.counterparty_name ?? undefined,
    documentNo: row.document_no,
    executionStatus: row.execution_status,
    id: row.id,
    isOutOfBudget: row.is_out_of_budget,
    meetingStatus: row.meeting_status,
    projectName: row.project_name || undefined,
    reservedAmount: activeReservedAmounts.get(row.id) ?? 0,
    title: row.title,
  }));
}

export async function getApprovalDocument(id: string) {
  const documents = await listApprovalDocuments(undefined, id);
  return documents.find((document) => document.id === id) ?? null;
}

export async function createApprovalDocument(
  input: ApprovalDraftInput,
  submit = false,
  operation?: { id: string; key: string },
) {
  const actor = await requireApprovalActor();
  if (submit) throw new Error("초안을 저장한 뒤 실제 결재 계정을 연결하고 상신해주세요.");
  if (!operation?.id || !operation.key) throw new Error("기안 생성 처리키가 필요합니다.");
  input = { ...input, drafterLabel: actor.display_name };
  const client = requireClient();
  let effectiveInput = input;
  if (input.approvalLineRuleId) {
    const { data: rule, error: ruleError } = await client
      .schema("approval")
      .from("approval_line_rules")
      .select("document_type,min_amount,max_amount,steps")
      .eq("id", input.approvalLineRuleId)
      .or(`organization_id.eq.${actor.organization_id},organization_id.is.null`)
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
  validateApprovalDraft(effectiveInput, { submit });
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
    getApprovalSettings(actor.organization_id),
    listMeetingRules(actor.organization_id),
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
  const saved = await commitApprovalCommand("CREATE", operation.id, {
    document: { ...document, recommendedMeetingBody: recommendedBody,
      recommendationReason: recommendedBody ? matchedRule?.reason ?? `${settings.meetingThresholdAmount.toLocaleString("ko-KR")}원 이상 금액 기준` : undefined,
      regulationReference: matchedRule?.regulation_reference || undefined },
    lines: effectiveInput.lines ?? [], steps: effectiveInput.approvalSteps,
  }, { expectedVersion: 0, key: operation.key });
  return saved.id;
}

export async function uploadApprovalAttachment(
  documentId: string,
  file: File,
  actorLabel: string,
) {
  const { actor } = await requireApprovalRecord(documentId, true);
  actorLabel = actor.display_name;
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
      auth_actor_id: actor.user_id,
      after_data: { fileName: file.name, fileSize: file.size },
      document_id: documentId,
    });
}

export async function createApprovalAttachmentDownloadUrl(
  attachmentId: string,
) {
  await requireApprovalActor();
  const client = requireClient();
  const { data: attachment, error } = await client
    .schema("approval")
    .from("attachments")
    .select("document_id,storage_bucket,storage_path")
    .eq("id", attachmentId)
    .maybeSingle();
  if (error || !attachment) throw new Error("첨부파일을 찾지 못했어.");
  await requireApprovalRecord(attachment.document_id);
  if (attachment.storage_bucket !== "approval-attachments") throw new Error("기안 첨부 저장소를 확인해주세요.");
  const { data, error: signedUrlError } = await client.storage
    .from(attachment.storage_bucket)
    .createSignedUrl(attachment.storage_path, 60);
  if (signedUrlError || !data?.signedUrl)
    throw new Error("첨부파일 열기 주소를 만들지 못했어.");
  return data.signedUrl;
}

export async function decideApprovalDocument(id: string, actorLabel: string, decision: "APPROVE" | "REJECT", comment: string | undefined, context: ApprovalCommandContext) {
  void actorLabel;
  if (!["APPROVE", "REJECT"].includes(decision)) throw new Error("지원하지 않는 결재 명령입니다.");
  if (decision === "REJECT" && !comment?.trim()) throw new Error("반려 사유를 입력해주세요.");
  await commitApprovalCommand(decision, id, { comment: comment || null }, context);
}
export async function submitApprovalDocument(id: string, context: ApprovalCommandContext) {
  await commitApprovalCommand("SUBMIT", id, {}, context);
}

export async function createExpenseDraftFromApproval(
  id: string,
  _actorLabel: string,
  context: ApprovalCommandContext,
) {
  const actor = await requireApprovalActor("ADMIN");
  await requireApprovalRecord(id);
  const document = await getApprovalDocument(id);
  if (!document) throw new Error("기안 문서를 찾지 못했어.");
  return handoffApprovalToFinance(document, actor, undefined, context);
}

type FinanceHandoffResult = {
  contractPaymentId?: string;
  executionLinkId: string;
  expenseResolutionId: string;
  workflowTransactionId: string;
};
type ApprovalContractPayment = NonNullable<ApprovalDocument["contractPayments"]>[number];

async function handoffApprovalToFinance(
  document: ApprovalDocument,
  actor: Awaited<ReturnType<typeof requireApprovalActor>>,
  payment: ApprovalContractPayment | undefined,
  context: ApprovalCommandContext,
): Promise<FinanceHandoffResult> {
  if (!context?.key || !Number.isInteger(context.expectedVersion) || context.expectedVersion < 0)
    throw new Error("기안 버전과 처리키가 필요합니다.");
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Seoul",
  });
  const isContractPayment = !!payment;
  const amount = payment?.amount ?? document.amount;
  const subject = isContractPayment ? `${document.title} 분할지급` : document.title;
  const base: ExpenseResolution = {
    accountHolder: document.counterpartyName ?? "미지정",
    accountNumber: "",
    approvalLines: createDefaultApprovalLines(),
    approvalStatus: "DRAFT",
    bankName: "미지정",
    budgetItem: document.budgetItem ?? "미지정",
    createdAt: today,
    createdBy: isContractPayment ? actor.display_name : document.drafterLabel,
    createdByTitle: isContractPayment ? "계약담당" : document.departmentLabel,
    evidenceFiles: [],
    expenseType: document.budgetItem ?? "기타",
    history: [
      {
        actionAt: `${today} 00:00`,
        actionLabel: `기안 ${document.documentNo}에서 회계·자금으로 인계`,
        actionType: "CREATED",
        actorName: actor.display_name,
        actorTitle: "",
        id: `approval-${document.id}`,
      },
    ],
    id: isContractPayment
      ? `contract-payment-${payment.id}`
      : `approval-expense-${document.id}`,
    paymentStatus: "BEFORE_PAYMENT",
    plannedPaymentDate: payment?.dueDate ?? today,
    projectName: document.projectName ?? "",
    reason: isContractPayment
      ? `기안 ${document.documentNo} 계약 분할지급`
      : document.purpose,
    resolutionNo: "생성중",
    settlementStatus: "NOT_REQUIRED",
    subject,
    supplyAmount: amount,
    totalAmount: amount,
    vatAmount: 0,
    vendorName: document.counterpartyName ?? "미지정",
  };
  const { data, error } = await requireClient()
    .schema("approval")
    .rpc("handoff_to_finance", {
      p_actor: actor.user_id,
      p_contract_payment_id: payment?.id ?? null,
      p_document_id: document.id,
      p_expected_version: context.expectedVersion,
      p_key: context.key,
      p_org: actor.organization_id,
      p_resolution_data: {
        ...toManagedExpenseResolutionDraft(base),
        approvalDocumentId: document.id,
        approvalDocumentNo: document.documentNo,
        creationSource: isContractPayment ? "CONTRACT_PAYMENT" : "APPROVAL_LINKED",
        directExpenseDecision: "ALLOWED",
        directExpenseReasons: [
          isContractPayment
            ? "승인된 계약기안의 분할지급입니다."
            : "승인된 기안에서 생성된 지출결의입니다.",
        ],
      },
    });
  if (error)
    throw new Error(`회계·자금 업무로 넘기지 못했어: ${error.message}`);
  const result = data as {
    contract_payment_id: string | null;
    execution_link_id: string;
    expense_resolution_id: string;
    workflow_transaction_id: string;
  } | null;
  if (!result?.execution_link_id || !result.expense_resolution_id || !result.workflow_transaction_id)
    throw new Error("회계·자금 연결 결과를 확인하지 못했어. 같은 처리키로 다시 확인해줘.");
  return {
    contractPaymentId: result.contract_payment_id ?? undefined,
    executionLinkId: result.execution_link_id,
    expenseResolutionId: result.expense_resolution_id,
    workflowTransactionId: result.workflow_transaction_id,
  };
}

export async function createMeetingAgenda(
  id: string,
  actorLabel: string,
  meetingBody: "BOARD" | "DELEGATES" | "GENERAL_ASSEMBLY",
) {
  const actor = await requireApprovalActor("ADMIN");
  await requireApprovalRecord(id);
  actorLabel = actor.display_name;
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
  const actor = await requireApprovalActor("ADMIN");
  await requireApprovalRecord(input.documentId);
  input = { ...input, actorLabel: actor.display_name };
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
  const actor = await requireApprovalActor("ADMIN");
  await requireApprovalRecord(id);
  actorLabel = actor.display_name;
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
  _actorLabel: string,
  context: ApprovalCommandContext,
) {
  const actor = await requireApprovalActor("ADMIN");
  await requireApprovalRecord(documentId);
  const document = await getApprovalDocument(documentId);
  const payment = document?.contractPayments?.find(
    (item) => item.id === paymentId,
  );
  if (!document || !payment)
    throw new Error("계약 분할지급 일정을 찾지 못했어.");
  return handoffApprovalToFinance(document, actor, payment, context);
}

export async function updateApprovalDocument(id: string, actorLabel: string, changes: {
  amount?: number; budgetItem?: string; counterpartyName?: string; projectName?: string; title?: string;
}, context: ApprovalCommandContext) {
  void actorLabel;
  await commitApprovalCommand("UPDATE", id, { changes }, context);
}
export async function resubmitApprovalDocument(id: string, actorLabel: string, changes: {
  amount: number; body: string; budgetItem: string; counterpartyName: string; projectName: string; purpose: string; title: string;
}, context: ApprovalCommandContext) {
  void actorLabel;
  if (!changes.title.trim() || !changes.body.trim() || !changes.purpose.trim()) throw new Error("제목, 기안 내용, 목적을 입력해주세요.");
  await commitApprovalCommand("RESUBMIT", id, { changes }, context);
}
export async function closeApprovalDocument(id: string, actorLabel: string, action: "WITHDRAWN" | "CANCELLED", reason: string, context: ApprovalCommandContext) {
  void actorLabel;
  if (!["WITHDRAWN", "CANCELLED"].includes(action) || !reason.trim()) throw new Error("회수·취소 명령과 사유를 확인해주세요.");
  await commitApprovalCommand("CLOSE", id, { action, reason }, context);
}

export type ApprovalBudgetSummary = {
  unresolvedCount?: number;
  approved: number;
  available: number;
  executed: number;
  reserved: number;
};
export async function getApprovalBudgetSummary(): Promise<ApprovalBudgetSummary> {
  const actor=await requireApprovalActor();
  const rows=await listApprovalBudgets(actor.organization_id);
  const year=Number(new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric"}).format(new Date()));
  const budgets=rows.filter(b=>b.fiscalYear===year);
  const approved=budgets.reduce((s,b)=>s+b.approvedAmount,0);
  const executed=budgets.reduce((s,b)=>s+b.executedAmount,0);
  const reserved=budgets.reduce((s,b)=>s+(b.annualReservedAmount??0),0);
  return {approved,executed,reserved,available:approved-executed-reserved,unresolvedCount:Math.max(0,...budgets.map(b=>b.unresolvedCount??0))};
}
