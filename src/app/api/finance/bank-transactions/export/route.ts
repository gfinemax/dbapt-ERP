import { NextRequest } from "next/server";

import { listAccountSubjectsFromSupabase } from "@/features/basic-info/account-subject-repository";
import { listBankAccountsFromSupabase } from "@/features/basic-info/bank-account-repository";
import {
  buildBankTransactionExportData,
  buildBankTransactionPdf,
  buildBankTransactionWorkbook,
} from "@/features/finance/bank-transaction-export.server";
import { normalizeBankTransactionExportColumns } from "@/features/finance/bank-transaction-export-columns";
import {
  listBankTransactions,
  loadBankTransactionSourceReconciliationSummary,
  type BankTransactionClassificationStatus,
  type BankTransactionListFilters,
} from "@/features/finance/bank-transaction-repository";
import { expenseDb, requireExpenseActor } from "@/features/finance/expense-authorization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const classificationStatuses = new Set<BankTransactionClassificationStatus>(["UNREVIEWED", "RECOMMENDED", "CONFIRMED", "DEFERRED", "EXCLUDED"]);
const excelRowLimit = 20_000;
const pdfRowLimit = 1_000;

export async function POST(request: NextRequest) {
  let actor: Awaited<ReturnType<typeof requireExpenseActor>>;
  try {
    actor = await requireExpenseActor("ADMIN");
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "관리자 권한을 확인하지 못했어." }, { status: 403 });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const format = body.format === "pdf" ? "pdf" : body.format === "xlsx" ? "xlsx" : null;
    if (!format) return Response.json({ message: "내보내기 형식을 엑셀 또는 PDF로 선택해줘." }, { status: 400 });
    const columns = normalizeBankTransactionExportColumns(body.columns);
    if (format === "pdf" && columns.length > 10) {
      return Response.json({ message: "PDF는 읽기 편하도록 컬럼을 10개 이하로 선택해줘. 더 많은 컬럼은 엑셀을 이용해줘." }, { status: 422 });
    }
    const filters = normalizeFilters(body.filters);
    const sourceSummary = filters.sourceReconciliationStatus
      ? await loadBankTransactionSourceReconciliationSummary(actor.organization_id, filters.bankAccountId)
      : undefined;
    const transactionIds = filters.sourceReconciliationStatus ? sourceSummary?.issues.map((issue) => issue.bankTransactionId) ?? [] : undefined;
    const rows = await loadAllRows(actor.organization_id, filters, transactionIds, format === "pdf" ? pdfRowLimit : excelRowLimit);
    const [bankAccounts, accountSubjects] = await Promise.all([
      listBankAccountsFromSupabase(actor.organization_id),
      listAccountSubjectsFromSupabase(actor.organization_id),
    ]);
    const data = buildBankTransactionExportData({
      accountSubjects: accountSubjects ?? [],
      bankAccounts: bankAccounts ?? [],
      columns,
      filters,
      rows,
      title: typeof body.title === "string" ? body.title : undefined,
    });
    const file = format === "pdf" ? await buildBankTransactionPdf(data) : await buildBankTransactionWorkbook(data);
    const stamp = koreaFileStamp(data.generatedAt);
    const fileName = `bank-transactions-${stamp}.${format}`;
    const { error: auditError } = await expenseDb().schema("finance").from("bank_transaction_export_audit_logs").insert({
      actor_id: actor.user_id,
      actor_label: actor.display_name,
      deposit_total: data.totals.deposit,
      export_format: format.toUpperCase(),
      file_name: fileName,
      filters,
      organization_id: actor.organization_id,
      row_count: data.records.length,
      selected_columns: columns,
      withdrawal_total: data.totals.withdrawal,
    });
    if (auditError) throw new Error(`내보내기 감사 이력을 저장하지 못했어: ${auditError.message}`);
    return new Response(new Uint8Array(file), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "X-Export-Filename": fileName,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "거래내역을 내보내지 못했어.";
    const status = message.includes("건을 초과") ? 422 : 500;
    console.error("Failed to export bank transactions", error);
    return Response.json({ message }, { status });
  }
}

async function loadAllRows(
  organizationId: string,
  filters: BankTransactionListFilters,
  transactionIds: string[] | undefined,
  rowLimit: number,
) {
  const pageSize = 500;
  const first = await listBankTransactions(organizationId, 1, filters, transactionIds, pageSize);
  if (first.totalCount > rowLimit) {
    throw new Error(`검색 결과가 ${rowLimit.toLocaleString("ko-KR")}건을 초과해. 기간·계좌·상태 조건을 좁힌 뒤 다시 내보내줘.`);
  }
  const rows = [...first.rows];
  for (let page = 2; page <= first.totalPages; page += 1) {
    rows.push(...(await listBankTransactions(organizationId, page, filters, transactionIds, pageSize)).rows);
  }
  return rows;
}

function normalizeFilters(value: unknown): BankTransactionListFilters {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const status = typeof input.classificationStatus === "string" && classificationStatuses.has(input.classificationStatus as BankTransactionClassificationStatus)
    ? input.classificationStatus as BankTransactionClassificationStatus : undefined;
  const originType = input.originType === "BANK_TRANSACTION" || input.originType === "EXTERNAL_RECOGNITION" ? input.originType : undefined;
  return {
    bankAccountId: cleanString(input.bankAccountId, 100),
    classificationStatus: status,
    dateFrom: cleanDate(input.dateFrom),
    dateTo: cleanDate(input.dateTo),
    externalRecognitionKind: originType === "EXTERNAL_RECOGNITION" && (input.externalRecognitionKind === "FIXED_CERTIFICATE" || input.externalRecognitionKind === "GENERAL")
      ? input.externalRecognitionKind
      : undefined,
    originType,
    query: cleanString(input.query, 100),
    sourceReconciliationStatus: input.sourceReconciliationStatus === "SOURCE_REVIEW_REQUIRED" ? "SOURCE_REVIEW_REQUIRED" : undefined,
  };
}

function cleanString(value: unknown, length: number) {
  return typeof value === "string" ? value.trim().slice(0, length) || undefined : undefined;
}

function cleanDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? undefined : value;
}

function koreaFileStamp(value: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    day: "2-digit", hour: "2-digit", hour12: false, minute: "2-digit", month: "2-digit", timeZone: "Asia/Seoul", year: "numeric",
  }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}`;
}
