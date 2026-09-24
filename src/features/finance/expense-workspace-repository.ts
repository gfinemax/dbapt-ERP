import { requireReimbursementIdentity } from "./reimbursement-auth";
import { reimbursementDb } from "./reimbursement-repository";
import type { ReimbursementPermission } from "./reimbursement-domain";
import type { WorkflowAmounts } from "./fund-workflow-repository";
import type { EvidenceOcrData, EvidenceOcrJobStage } from "./expense-evidence";

export type ExpenseSourceKind = "RESOLUTION" | "SMALL" | "QUICK" | "PERSONAL";
export type ExpenseWorkspaceRecord = {
  source_kind: ExpenseSourceKind; source_id: string; number: string | null; title: string; amount: number;
  created_at: string; used_at: string | null; accounting_date: string | null; budget_month: string | null;
  updated_at?: string;
  approval_status: string; payment_status: string | null; author_label: string | null; counterparty: string | null;
  transaction_id: string | null; can_connect: boolean; amounts: WorkflowAmounts | null;
  trust_items: { id: string; request_id: string; request_no: string; status: string; requested_amount: number; approved_amount: number; paid_amount: number; needs_review: boolean }[];
  vouchers: { id: string; voucher_no: string; status: string; source_kind: string | null }[];
  evidence_files?: { ocr_job_id: string; file_name: string; content_type: string; storage_path: string; evidence_type: string; status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"; stage: EvidenceOcrJobStage; progress: number; result_data: EvidenceOcrData; error_message: string | null; created_at: string }[];
  evidence_kind?: string; evidence_review_status?: string; missing_evidence_reason?: string; evidence_review_note?: string;
  budget_item?: string; expense_detail_id?: string;
  usage_description?: string; memo?: string;
  personal_purpose?: string; personal_updated_at?: string; personal_can_edit?: boolean; personal_is_applicant?: boolean;
};
export type ExpenseWorkspacePagination = {
  totalCount: number;
  filteredCount: number;
  kindCounts: Record<ExpenseSourceKind | "ALL", number>;
  page: number;
  pageSize: number;
  pageCount: number;
};
export type ExpenseWorkspace = {
  records: ExpenseWorkspaceRecord[];
  selectedRecord?: ExpenseWorkspaceRecord | null;
  pagination?: ExpenseWorkspacePagination;
  viewer: { staff: boolean; permissions: ReimbursementPermission[] };
};
export type ExpenseWorkspaceQuery = {
  kind?: string;
  connection?: string;
  page?: string;
  q?: string;
  sort?: string;
  status?: string;
  source_kind?: string;
  source_id?: string;
};

type SmallExpenseRow = {
  id: string; expense_date: string; partner_name: string; description: string; amount: number | string;
  created_at: string; updated_at: string; review_status: string; created_by_label: string | null;
  quick_record_id: string | null;
};

async function loadSmallExpenseRows(organizationId: string) {
  const pageSize = 1000; const rows: SmallExpenseRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await reimbursementDb().schema("approval").from("small_expenses")
      .select("id,expense_date,partner_name,description,amount,created_at,updated_at,review_status,created_by_label,quick_record_id")
      .eq("organization_id", organizationId).is("deleted_at", null).order("created_at", { ascending: false }).range(from, from + pageSize - 1);
    if (result.error) throw new Error(`소액지출 원본 조회 실패: ${result.error.message}`);
    const page = (result.data ?? []) as SmallExpenseRow[]; rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function loadExpenseWorkspace(): Promise<ExpenseWorkspace> {
  const member = await requireReimbursementIdentity();
  if (!member.active) throw new Error("활성 조직 권한이 필요합니다.");
  const { data, error } = await reimbursementDb().schema("finance").rpc("expense_workspace", { p_org: member.organization_id, p_actor: member.user_id });
  if (error) throw new Error(`지출 자료 조회 실패: ${error.message}`);
  if (!data || !Array.isArray(data.records)) throw new Error("지출 자료 조회 결과를 확인해주세요.");
  const isStaff = member.permissions.some(p => ["ADMIN", "APPROVE", "PAY", "CLOSE", "SENIOR"].includes(p));
  const quickIds = data.records.filter((record: ExpenseWorkspaceRecord) => record.source_kind === "QUICK").map((record: ExpenseWorkspaceRecord) => record.source_id);
  const personalIds = data.records.filter((record: ExpenseWorkspaceRecord) => record.source_kind === "PERSONAL").map((record: ExpenseWorkspaceRecord) => record.source_id);
  const resolutionIds = data.records.filter((record: ExpenseWorkspaceRecord) => record.source_kind === "RESOLUTION").map((record: ExpenseWorkspaceRecord) => record.source_id);
  const [smallRows, quickMeta, personalMeta, resolutionMeta] = await Promise.all([
    isStaff ? loadSmallExpenseRows(member.organization_id) : Promise.resolve([]),
    quickIds.length ? reimbursementDb().schema("finance").from("quick_expense_records").select("id,usage_description,budget_item,expense_detail_id,evidence_kind,evidence_review_status,missing_evidence_reason,evidence_review_note").eq("organization_id", member.organization_id).in("id", quickIds) : Promise.resolve({ data: [], error: null }),
    personalIds.length ? reimbursementDb().schema("finance").from("personal_reimbursements").select("id,applicant_id,purpose,updated_at").eq("organization_id", member.organization_id).in("id", personalIds) : Promise.resolve({ data: [], error: null }),
    resolutionIds.length ? reimbursementDb().schema("finance").from("expense_resolutions").select("id,resolution_data").eq("organization_id", member.organization_id).in("id", resolutionIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (quickMeta.error) throw new Error(`간편지출 증빙 상태 조회 실패: ${quickMeta.error.message}`);
  if (personalMeta.error) throw new Error(`개인 정산 수정 정보 조회 실패: ${personalMeta.error.message}`);
  if (resolutionMeta.error) throw new Error(`지출결의 작성 내용 조회 실패: ${resolutionMeta.error.message}`);
  const smallQuickIds = new Set(smallRows.map(row => row.quick_record_id).filter((id): id is string => !!id));
  const byId = new Map((quickMeta.data ?? []).map(row => [row.id, row]));
  const personalById = new Map((personalMeta.data ?? []).map(row => [row.id, row]));
  const resolutionById = new Map((resolutionMeta.data ?? []).map(row => [row.id, row]));
  const isAdmin = member.permissions.includes("ADMIN");
  const rpcRecords: ExpenseWorkspaceRecord[] = data.records.map((record: ExpenseWorkspaceRecord): ExpenseWorkspaceRecord => {
    if (record.source_kind === "QUICK") {
      const meta = byId.get(record.source_id);
      return { ...record, ...meta, usage_description: meta?.usage_description ?? record.title };
    }
    if (record.source_kind === "PERSONAL") {
      const meta = personalById.get(record.source_id);
      return { ...record, usage_description: meta?.purpose, personal_purpose: meta?.purpose, personal_updated_at: meta?.updated_at, personal_can_edit: record.approval_status === "SUBMITTED" && !!meta && (meta.applicant_id === member.user_id || isAdmin), personal_is_applicant: meta?.applicant_id === member.user_id };
    }
    if (record.source_kind === "RESOLUTION") {
      const resolutionData = resolutionById.get(record.source_id)?.resolution_data;
      const source = resolutionData && typeof resolutionData === "object" ? resolutionData as Record<string, unknown> : {};
      return {
        ...record,
        usage_description: typeof source.reason === "string" ? source.reason : undefined,
        memo: typeof source.memo === "string" ? source.memo : undefined,
      };
    }
    return record;
  });
  const quickById = new Map<string, ExpenseWorkspaceRecord>(rpcRecords.filter(record => record.source_kind === "QUICK").map(record => [record.source_id, record]));
  const smallRecords: ExpenseWorkspaceRecord[] = smallRows.map(row => {
    const linked = row.quick_record_id ? quickById.get(row.quick_record_id) : undefined;
    return {
      source_kind: "SMALL", source_id: row.id, number: null, title: row.description, amount: Number(row.amount),
      created_at: row.created_at, updated_at: row.updated_at, used_at: row.expense_date, accounting_date: null,
      budget_month: `${row.expense_date.slice(0, 7)}-01`, approval_status: row.review_status, payment_status: linked?.payment_status ?? null,
      author_label: row.created_by_label, counterparty: row.partner_name, transaction_id: linked?.transaction_id ?? null,
      can_connect: false, amounts: linked?.amounts ?? null, trust_items: linked?.trust_items ?? [], vouchers: linked?.vouchers ?? [],
      evidence_files: linked?.evidence_files ?? [],
      usage_description: row.description,
    };
  });
  const records = [...rpcRecords.filter((record: ExpenseWorkspaceRecord) => !(record.source_kind === "QUICK" && smallQuickIds.has(record.source_id))), ...smallRecords]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || a.source_kind.localeCompare(b.source_kind) || a.source_id.localeCompare(b.source_id));
  return { records, viewer: { staff: isStaff, permissions: [...member.permissions] } };
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function finiteCount(value: unknown) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

export async function loadExpenseWorkspacePage(
  query: ExpenseWorkspaceQuery = {},
): Promise<ExpenseWorkspace> {
  const member = await requireReimbursementIdentity();
  if (!member.active) throw new Error("활성 조직 권한이 필요합니다.");

  const page = positiveInteger(query.page, 1);
  const { data, error } = await reimbursementDb()
    .schema("finance")
    .rpc("expense_workspace_page", {
      p_org: member.organization_id,
      p_actor: member.user_id,
      p_page: page,
      p_page_size: 50,
      p_kind: query.kind ?? "ALL",
      p_connection: query.connection ?? "ALL",
      p_search: query.q ?? "",
      p_sort: query.sort ?? "USED_DESC",
      p_status: query.status ?? "",
      p_source_kind: query.source_kind ?? null,
      p_source_id: query.source_id ?? null,
    });
  if (error) throw new Error(`지출 자료 조회 실패: ${error.message}`);
  if (!data || !Array.isArray(data.records))
    throw new Error("지출 자료 조회 결과를 확인해주세요.");

  const isStaff = member.permissions.some((permission) =>
    ["ADMIN", "APPROVE", "PAY", "CLOSE", "SENIOR"].includes(permission),
  );
  const rawKindCounts = data.kind_counts && typeof data.kind_counts === "object"
    ? data.kind_counts as Record<string, unknown>
    : {};
  const kindCounts = Object.fromEntries(
    ["ALL", "RESOLUTION", "SMALL", "QUICK", "PERSONAL"].map((kind) => [
      kind,
      finiteCount(rawKindCounts[kind]),
    ]),
  ) as ExpenseWorkspacePagination["kindCounts"];

  return {
    records: data.records as ExpenseWorkspaceRecord[],
    selectedRecord: data.selected_record as ExpenseWorkspaceRecord | null,
    pagination: {
      totalCount: finiteCount(data.total_count),
      filteredCount: finiteCount(data.filtered_count),
      kindCounts,
      page: positiveInteger(String(data.page ?? ""), page),
      pageSize: positiveInteger(String(data.page_size ?? ""), 50),
      pageCount: positiveInteger(String(data.page_count ?? ""), 1),
    },
    viewer: { staff: isStaff, permissions: [...member.permissions] },
  };
}
