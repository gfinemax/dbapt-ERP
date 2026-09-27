import writeXlsxFile, { type Cell, type SheetData } from "write-excel-file/node";

import { reimbursementDb } from "./reimbursement-repository";

type VoucherRow = {
  approval_status: string;
  id: string;
  memo: string | null;
  voucher_date: string;
  voucher_no: string;
};

type VoucherLineRow = {
  account_subject_id: string | null;
  account_subjects: { code: string; name: string } | { code: string; name: string }[] | null;
  credit_amount: number | string;
  debit_amount: number | string;
  description: string;
  sort_order: number;
  voucher_id: string;
};

type TaxEvidenceRow = {
  evidence_type: string;
  expense_resolutions: { organization_id: string; resolution_no: string } | { organization_id: string; resolution_no: string }[] | null;
  id: string;
  original_filename: string;
  resolution_id: string;
  uploaded_at: string;
};

export type TaxAccountantExportData = {
  evidence: Array<{ evidenceType: string; fileName: string; id: string; resolutionId: string; resolutionNo: string; uploadedAt: string }>;
  generatedAt: string;
  month: string;
  organizationName: string;
  voucherLines: Array<{
    accountCode: string;
    accountName: string;
    approvalStatus: string;
    creditAmount: number;
    debitAmount: number;
    description: string;
    memo: string;
    sortOrder: number;
    voucherDate: string;
    voucherId: string;
    voucherNo: string;
  }>;
};

const headerStyle = { backgroundColor: "#D9EAF7", fontWeight: "bold" as const, align: "center" as const, wrap: true };
const currencyCell = (value: number): Cell => ({ format: "#,##0", type: Number, value });
const dateCell = (value: string): Cell => ({ format: "yyyy-mm-dd", type: Date, value: new Date(`${value.slice(0, 10)}T00:00:00+09:00`) });

export function taxAccountantWorkbookSheets(data: TaxAccountantExportData) {
  const voucherSheet: SheetData = [
    ["전표일자", "전표번호", "상태", "계정코드", "계정과목", "적요", "차변", "대변", "메모"].map((value) => ({ ...headerStyle, value })),
    ...data.voucherLines.map((line) => [
      dateCell(line.voucherDate), line.voucherNo, line.approvalStatus, line.accountCode, line.accountName, line.description,
      currencyCell(line.debitAmount), currencyCell(line.creditAmount), line.memo,
    ]),
  ];
  const evidenceSheet: SheetData = [
    ["등록일", "지출결의번호", "증빙유형", "파일명", "증빙 ID", "ERP 원본 경로"].map((value) => ({ ...headerStyle, value })),
    ...data.evidence.map((evidence) => [
      dateCell(evidence.uploadedAt), evidence.resolutionNo, evidence.evidenceType, evidence.fileName, evidence.id,
      `/finance/evidence/${encodeURIComponent(evidence.id)}/download`,
    ]),
  ];
  const guideSheet: SheetData = [
    [{ ...headerStyle, value: "항목" }, { ...headerStyle, value: "내용" }],
    ["조직 식별자", data.organizationName],
    ["대상월", data.month],
    ["생성일시", { format: "yyyy-mm-dd hh:mm", type: Date, value: new Date(data.generatedAt) }],
    ["전표 범위", "관리자가 확정한 전표와 분개행"],
    ["증빙 범위", "세금계산서·계산서·전자세금계산서·전자계산서로 분류된 증빙"],
    ["확인 사항", "이 파일은 세무사 검토용 자료이며 홈택스 신고 전송 또는 세무신고 확정을 대신하지 않습니다."],
    ["원본 열람", "증빙 시트의 ERP 원본 경로는 권한 있는 사용자가 ERP에 로그인한 상태에서 확인합니다."],
  ];
  return [
    { columns: [{ width: 13 }, { width: 20 }, { width: 13 }, { width: 18 }, { width: 20 }, { width: 36 }, { width: 16 }, { width: 16 }, { width: 32 }], data: voucherSheet, sheet: "확정 전표", stickyRowsCount: 1 },
    { columns: [{ width: 13 }, { width: 20 }, { width: 20 }, { width: 42 }, { width: 38 }, { width: 58 }], data: evidenceSheet, sheet: "세금 증빙 목록", stickyRowsCount: 1 },
    { columns: [{ width: 20 }, { width: 90 }], data: guideSheet, sheet: "안내" },
  ];
}

export async function buildTaxAccountantWorkbook(data: TaxAccountantExportData) {
  return writeXlsxFile(taxAccountantWorkbookSheets(data), { fontFamily: "맑은 고딕", fontSize: 10 }).toBuffer();
}

export async function loadTaxAccountantExportData(organizationId: string, month: string): Promise<TaxAccountantExportData> {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = monthNumber === 12 ? `${year + 1}-01-01` : `${year}-${String(monthNumber + 1).padStart(2, "0")}-01`;
  const db = reimbursementDb();
  const [voucherResult, evidenceResult] = await Promise.all([
    db.schema("finance").from("vouchers").select("id,voucher_no,voucher_date,approval_status,memo")
      .eq("organization_id", organizationId).eq("approval_status", "승인완료").is("deleted_at", null)
      .gte("voucher_date", start).lt("voucher_date", end).order("voucher_date").order("voucher_no").limit(10000),
    db.schema("finance").from("expense_resolution_evidence")
      .select("id,resolution_id,original_filename,evidence_type,uploaded_at,expense_resolutions!inner(organization_id,resolution_no)")
      .eq("expense_resolutions.organization_id", organizationId)
      .in("evidence_type", ["세금계산서", "계산서", "전자세금계산서", "전자계산서"])
      .gte("uploaded_at", `${start}T00:00:00+09:00`).lt("uploaded_at", `${end}T00:00:00+09:00`)
      .order("uploaded_at").limit(10000),
  ]);
  if (voucherResult.error) throw new Error(`확정 전표를 불러오지 못했어: ${voucherResult.error.message}`);
  if (evidenceResult.error) throw new Error(`세금 증빙 목록을 불러오지 못했어: ${evidenceResult.error.message}`);
  const vouchers = (voucherResult.data ?? []) as VoucherRow[];
  const voucherById = new Map(vouchers.map((voucher) => [voucher.id, voucher]));
  const lineResult = vouchers.length ? await db.schema("finance").from("voucher_lines")
    .select("voucher_id,account_subject_id,description,debit_amount,credit_amount,sort_order,account_subjects(code,name)")
    .in("voucher_id", vouchers.map((voucher) => voucher.id)).order("voucher_id").order("sort_order").limit(50000) : { data: [], error: null };
  if (lineResult.error) throw new Error(`전표 분개행을 불러오지 못했어: ${lineResult.error.message}`);

  return {
    evidence: ((evidenceResult.data ?? []) as unknown as TaxEvidenceRow[]).map((row) => {
      const resolution = Array.isArray(row.expense_resolutions) ? row.expense_resolutions[0] : row.expense_resolutions;
      return { evidenceType: row.evidence_type, fileName: row.original_filename, id: row.id, resolutionId: row.resolution_id, resolutionNo: resolution?.resolution_no ?? "", uploadedAt: row.uploaded_at };
    }),
    generatedAt: new Date().toISOString(),
    month,
    organizationName: organizationId,
    voucherLines: ((lineResult.data ?? []) as unknown as VoucherLineRow[]).flatMap((line) => {
      const voucher = voucherById.get(line.voucher_id);
      if (!voucher) return [];
      const account = Array.isArray(line.account_subjects) ? line.account_subjects[0] : line.account_subjects;
      return [{
        accountCode: account?.code ?? "미지정",
        accountName: account?.name ?? "미지정",
        approvalStatus: voucher.approval_status,
        creditAmount: Number(line.credit_amount),
        debitAmount: Number(line.debit_amount),
        description: line.description,
        memo: voucher.memo ?? "",
        sortOrder: line.sort_order,
        voucherDate: voucher.voucher_date,
        voucherId: voucher.id,
        voucherNo: voucher.voucher_no,
      }];
    }),
  };
}
