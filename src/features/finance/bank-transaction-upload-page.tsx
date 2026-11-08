"use client";

import { FileSpreadsheet, History, Upload } from "lucide-react";
import Link from "next/link";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";

import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import type { RegisteredAccountSubject } from "@/features/basic-info/account-subject-data";
import type { RegisteredBankAccount } from "@/features/basic-info/business-partner-data";
import { registeredBankAccounts } from "@/features/basic-info/business-partner-data";
import { formatKrw } from "./finance-data";
import { quickExpenseEntryHref } from "./quick-expense-entry";
import {
  parseBankTransactionRows,
  type ParsedBankTransactionRow,
  validateBankTransactionReplacementHeaders,
  validateBankTransactionReplacementRows,
} from "./bank-transaction-import";
import type { BankTransactionReplacementPreview, BankTransactionReplacementResult } from "./bank-transaction-replacement";
import type { BankSheetEnrichmentPreview, BankSheetEnrichmentResult, BankSheetSourceRow } from "./bank-transaction-sheet-enrichment";
import { BankTransactionSheetEnrichmentPanel } from "./bank-transaction-sheet-enrichment-panel";
import type { ApplyBankSheetEnrichmentInput } from "./bank-transaction-sheet-enrichment-repository";
import type { BankTransactionSheetImportHistoryEntry } from "./bank-transaction-sheet-import-history";

const statusClasses: Record<string, string> = {
  미분류: "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]",
  신규후보: "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
  업로드분류: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  자동추천: "bg-[var(--color-morning-tint)] text-[var(--color-deep-cobalt)]",
};

type BankTransactionUploadPageProps = {
  accessError?: string;
  applyBankTransactionSheetEnrichment?: (input: ApplyBankSheetEnrichmentInput) => Promise<BankSheetEnrichmentResult>;
  applyBankTransactionReplacement?: (input: {
    bankAccountId: string;
    expectedOldCount: number;
    reason: string;
    rows: ParsedBankTransactionRow[];
  }) => Promise<BankTransactionReplacementResult>;
  createBankTransactions?: (rows: ParsedBankTransactionRow[]) => Promise<{
    duplicateCount: number;
    importedCount: number;
    transactions: Array<{ id: string; isWithdrawal?: boolean }>;
  }>;
  initialAccountSubjects?: RegisteredAccountSubject[];
  initialBankAccounts?: RegisteredBankAccount[];
  initialSheetImportHistory?: BankTransactionSheetImportHistoryEntry[];
  loadBankTransactionReplacementPreview?: (bankAccountId: string) => Promise<BankTransactionReplacementPreview>;
  logoutAction?: () => Promise<void>;
  previewBankTransactionSheetEnrichment?: (input: { bankAccountId: string; sourceRows: BankSheetSourceRow[] }) => Promise<BankSheetEnrichmentPreview>;
  userLabel?: string;
};

export function BankTransactionUploadPage({
  accessError,
  applyBankTransactionSheetEnrichment,
  applyBankTransactionReplacement,
  createBankTransactions,
  initialAccountSubjects = [],
  initialBankAccounts = registeredBankAccounts,
  initialSheetImportHistory = [],
  loadBankTransactionReplacementPreview,
  logoutAction,
  previewBankTransactionSheetEnrichment,
  userLabel = "로그인 필요",
}: BankTransactionUploadPageProps = {}) {
  const bankAccounts = initialBankAccounts;
  const accountSubjects = initialAccountSubjects;
  const [selectedAccountId, setSelectedAccountId] = useState(bankAccounts[1]?.id ?? bankAccounts[0]?.id ?? "");
  const [tableText, setTableText] = useState("");
  const [previewRows, setPreviewRows] = useState<ParsedBankTransactionRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedTransactionIds, setSavedTransactionIds] = useState<string[]>([]);
  const [uploadMode, setUploadMode] = useState<"append" | "replace">("append");
  const [replacementPreview, setReplacementPreview] = useState<BankTransactionReplacementPreview | null>(null);
  const [replacementPreviewError, setReplacementPreviewError] = useState<string | null>(null);
  const [replacementPreviewLoading, setReplacementPreviewLoading] = useState(false);
  const [replacementReason, setReplacementReason] = useState("");
  const selectedAccount = useMemo(
    () => bankAccounts.find((account) => account.id === selectedAccountId) ?? bankAccounts[0],
    [bankAccounts, selectedAccountId],
  );
  const summary = useMemo(
    () => ({
      autoRecommended: previewRows.filter((row) => row.matchStatus === "자동추천").length,
      newCandidates: previewRows.filter((row) => row.matchStatus === "신규후보").length,
      rowCount: previewRows.length,
      uploadedMatches: previewRows.filter((row) => row.matchStatus === "업로드분류").length,
    }),
    [previewRows],
  );
  const replacementValidationErrors = useMemo(
    () => uploadMode === "replace" ? validateBankTransactionReplacementRows(previewRows) : [],
    [previewRows, uploadMode],
  );

  useEffect(() => {
    if (uploadMode !== "replace" || !selectedAccount || !loadBankTransactionReplacementPreview) {
      return;
    }
    let active = true;
    loadBankTransactionReplacementPreview(selectedAccount.id)
      .then((preview) => {
        if (active) setReplacementPreview(preview);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setReplacementPreview(null);
        setReplacementPreviewError(error instanceof Error ? error.message : "교체 대상 원장을 확인하지 못했어.");
      })
      .finally(() => {
        if (active) setReplacementPreviewLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadBankTransactionReplacementPreview, selectedAccount, uploadMode]);

  if (accessError) {
    return (
      <ErpShell activeDetailLabel="은행 거래 업로드" activeLabel="회계·자금" activeWorkspaceLabel="연동·설정" logoutAction={logoutAction} userLabel={userLabel}>
        <section className="mx-auto max-w-[1480px] rounded-2xl border border-[var(--color-butter-soft)] bg-[var(--color-butter-soft)] p-6" role="alert">
          <h1 className="text-2xl font-bold">은행거래 관리 로그인이 필요해</h1>
          <p className="mt-2 text-sm text-[var(--color-stone)]">{accessError}</p>
          <Link className="mt-4 inline-block rounded-full bg-[var(--color-pressed-charcoal)] px-4 py-2 text-sm font-semibold text-white" href="/finance">정산 업무 로그인</Link>
        </section>
      </ErpShell>
    );
  }

  function createPreview(nextText = tableText) {
    const lines = nextText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      setParseError("헤더와 거래내역을 포함해 두 줄 이상 입력해 주세요.");
      setPreviewRows([]);
      setSaveMessage(null);
      return;
    }

    if (!selectedAccount) {
      setParseError("거래내역을 저장할 은행통장을 먼저 등록해 주세요.");
      setPreviewRows([]);
      setSaveMessage(null);
      return;
    }

    const delimiter = lines[0].includes("\t") ? "\t" : ",";
    const headers = splitLine(lines[0], delimiter);
    const rows = lines.slice(1).map((line) => splitLine(line, delimiter));

    if (uploadMode === "replace") {
      const missingHeaders = validateBankTransactionReplacementHeaders(headers);
      if (missingHeaders.length) {
        setParseError(`교체 파일 필수 컬럼을 확인해줘: ${missingHeaders.join(", ")}`);
        setPreviewRows([]);
        setSaveMessage(null);
        return;
      }
    }

    setParseError(null);
    setSaveError(null);
    setSaveMessage(null);
    setPreviewRows(
      parseBankTransactionRows({
        accountSubjects,
        headers,
        rows,
        selectedBankAccountId: selectedAccount.id,
        selectedBankAccountName: selectedAccount.accountName,
      }),
    );
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const { readBankTransactionFile } = await import("./bank-transaction-file");
      const text = await readBankTransactionFile(file);
      setTableText(text);
      createPreview(text);
    } catch {
      setParseError("엑셀 파일을 읽지 못했습니다. 첫 번째 시트에 거래내역 표가 있는지 확인해 주세요.");
      setPreviewRows([]);
      setSaveMessage(null);
    }
  }

  async function handleSave() {
    if (previewRows.length === 0) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      if (uploadMode === "replace") {
        if (!applyBankTransactionReplacement || !replacementPreview?.ready) {
          throw new Error("교체 대상과 후속 업무 연결을 먼저 확인해줘.");
        }
        if (replacementValidationErrors.length) {
          throw new Error(replacementValidationErrors.slice(0, 3).join(" "));
        }
        const result = await applyBankTransactionReplacement({
          bankAccountId: selectedAccountId,
          expectedOldCount: replacementPreview.target_count,
          reason: replacementReason,
          rows: previewRows,
        });
        setSavedTransactionIds([]);
        setSaveMessage(`기존 오류 원장 ${result.replaced_count}건을 사용 제외하고 새 원장 ${result.replacement_count}건을 등록했어. 교체 배치 ${result.batch_id}`);
        setReplacementPreview(null);
        return;
      }
      if (createBankTransactions) {
        const saved = await createBankTransactions(previewRows);
        setSavedTransactionIds(saved.transactions.filter((transaction) => transaction.isWithdrawal === true).map((transaction) => transaction.id));
        setSaveMessage(`신규 ${saved.importedCount}건을 저장했고 중복 ${saved.duplicateCount}건을 제외했습니다. 전표 생성·확정은 별도 검토 단계에서 처리합니다.`);
        return;
      }

      setSaveMessage(`${previewRows.length}건 저장 준비가 완료되었습니다. 전표 생성은 다음 단계에서 별도로 처리합니다.`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "거래내역 저장 처리에 실패했습니다. 계좌와 Supabase 연결 상태를 확인해 주세요.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ErpShell activeDetailLabel="은행 거래 업로드" activeLabel="회계·자금" activeWorkspaceLabel="연동·설정" logoutAction={logoutAction} userLabel={userLabel}>
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6">
        <section className="flex flex-col gap-4 rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 lg:flex-row lg:items-end lg:justify-between lg:p-7">
          <div>
            <p className="mb-3 inline-flex rounded-full bg-[var(--color-morning-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]">
              회계·자금 &gt; 연동·설정 &gt; 은행 거래 업로드
            </p>
            <h1 className="text-3xl font-bold tracking-normal">은행 거래 업로드</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--color-stone)]">
              등록된 은행통장을 선택한 뒤 거래내역을 업로드하고, 파일의 항/목 분류 또는 적요 기반 추천으로 계정과목 후보를 확인합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-stone)]">
              <Upload className="size-4" />
              CSV/TSV/엑셀 파일 선택
              <input accept=".csv,.tsv,.txt,.xlsx,.xls" className="sr-only" onChange={handleFileChange} type="file" />
            </label>
            <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" onClick={() => createPreview()} size="lg" type="button">
              <FileSpreadsheet className="size-4" />
              미리보기 생성
            </Button>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-4">
          <SummaryTile label="미리보기 거래" value={`${summary.rowCount}건`} />
          <SummaryTile label="업로드 분류 반영" value={`${summary.uploadedMatches}건`} />
          <SummaryTile label="자동 추천" value={`${summary.autoRecommended}건`} />
          <SummaryTile label="신규 후보" value={`${summary.newCandidates}건`} />
        </section>

        <SheetImportHistory history={initialSheetImportHistory} bankAccounts={bankAccounts} />

        <BankTransactionSheetEnrichmentPanel
          applyEnrichment={applyBankTransactionSheetEnrichment}
          bankAccounts={bankAccounts}
          previewEnrichment={previewBankTransactionSheetEnrichment}
        />

        <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
          <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
            <label className="grid gap-2 text-sm font-semibold" htmlFor="bank-upload-account">
              업로드 대상 계좌
              <select
                className="h-11 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm font-medium text-[var(--color-midnight-ink)]"
                id="bank-upload-account"
                onChange={(event) => {
                  setSelectedAccountId(event.target.value);
                  setPreviewRows([]);
                  setSaveMessage(null);
                  if (uploadMode === "replace") {
                    setReplacementPreview(null);
                    setReplacementPreviewError(null);
                    setReplacementPreviewLoading(true);
                  }
                }}
                value={selectedAccountId}
              >
                {bankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.accountName}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 grid gap-2 text-sm font-semibold" htmlFor="bank-upload-mode">
              업로드 방식
              <select
                className="h-11 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm font-medium text-[var(--color-midnight-ink)]"
                id="bank-upload-mode"
                onChange={(event) => {
                  const nextMode = event.target.value === "replace" ? "replace" : "append";
                  setUploadMode(nextMode);
                  setPreviewRows([]);
                  setParseError(null);
                  setSaveError(null);
                  setSaveMessage(null);
                  setReplacementPreview(null);
                  setReplacementPreviewError(null);
                  setReplacementPreviewLoading(nextMode === "replace");
                }}
                value={uploadMode}
              >
                <option value="append">일반 거래 추가</option>
                {applyBankTransactionReplacement ? <option value="replace">기존 Ledger 오류 원장 교체</option> : null}
              </select>
            </label>
            <div className="mt-4 rounded-xl bg-[var(--color-cloud-veil)] p-4 text-sm leading-6 text-[var(--color-stone)]">
              <p className="font-semibold text-[var(--color-midnight-ink)]">{selectedAccount?.accountName ?? "등록된 은행통장 없음"}</p>
              <p>{selectedAccount?.bankName ?? "-"}</p>
              <p>{selectedAccount?.accountNo ?? "-"}</p>
              <p>{selectedAccount?.accountType ?? "-"}</p>
            </div>
            <p className="mt-4 text-sm leading-6 text-[var(--color-stone)]">
              파일에 있는 `계좌구분` 값은 참고값으로만 보고, 실제 저장 계좌는 여기서 선택한 은행통장을 기준으로 처리합니다.
            </p>
            {uploadMode === "replace" ? (
              <div className="mt-4 rounded-xl border border-[var(--color-butter-soft)] bg-[var(--color-butter-soft)] p-4 text-sm leading-6">
                <p className="font-bold">기존 원장을 삭제하지 않고 교체 이력으로 보존해.</p>
                {replacementPreviewLoading ? <p className="mt-2 text-[var(--color-stone)]">교체 대상 확인 중...</p> : null}
                {replacementPreview ? (
                  <div className="mt-2 text-[var(--color-stone)]">
                    <p>교체 대상 {replacementPreview.target_count.toLocaleString("ko-KR")}건</p>
                    <p>입금 {formatKrw(replacementPreview.deposit_total)} · 출금 {formatKrw(replacementPreview.withdrawal_total)}</p>
                    <p>후속 업무 연결 {replacementPreview.blocker_count.toLocaleString("ko-KR")}건</p>
                    <p className={`mt-2 font-bold ${replacementPreview.ready ? "text-[var(--color-green-ink)]" : "text-[var(--color-tangerine)]"}`}>
                      {replacementPreview.ready ? "교체 준비 완료" : "교체 전 연결 검토 필요"}
                    </p>
                  </div>
                ) : null}
                {replacementPreviewError ? <p className="mt-2 font-semibold text-[var(--color-tangerine)]">{replacementPreviewError}</p> : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
            <label className="grid gap-2 text-sm font-semibold" htmlFor="bank-upload-table">
              거래내역 표 붙여넣기
              <textarea
                className="min-h-48 rounded-xl border border-[var(--color-soft-border)] bg-white p-4 font-mono text-sm leading-6 text-[var(--color-midnight-ink)]"
                id="bank-upload-table"
                onChange={(event) => setTableText(event.target.value)}
                value={tableText}
              />
            </label>
            <p className="mt-3 text-sm text-[var(--color-stone)]">엑셀 파일, 탭 구분, CSV 형식으로 입력할 수 있습니다. 헤더는 항/항목구분, 목, 거래고유번호, 거래일자, 거래시간, 거래종류, 적요, 입금, 출금, 잔액, 거래점/취급점을 인식합니다.</p>
            {parseError ? <p className="mt-3 rounded-lg bg-[var(--color-sunset-soft)] px-3 py-2 text-sm font-semibold text-[var(--color-tangerine)]">{parseError}</p> : null}
            {uploadMode === "replace" ? (
              <label className="mt-4 grid gap-2 text-sm font-semibold" htmlFor="bank-replacement-reason">
                원장 교체 사유
                <textarea
                  className="min-h-24 rounded-xl border border-[var(--color-soft-border)] bg-white p-3 text-sm leading-6"
                  id="bank-replacement-reason"
                  onChange={(event) => setReplacementReason(event.target.value)}
                  placeholder="예: 기존 Ledger 이관 133건의 거래일·금액·적요 오류를 정정하기 위해 검증된 은행 원장으로 교체"
                  value={replacementReason}
                />
              </label>
            ) : null}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-soft-border)] p-4">
            <div>
              <h2 className="text-lg font-bold">업로드 미리보기</h2>
              <p className="mt-1 text-sm text-[var(--color-stone)]">자동 전표 생성 전 단계이며, 여기서는 계정과목 후보와 신규 후보만 확인합니다.</p>
            </div>
            <Button
              className="rounded-full"
              disabled={previewRows.length === 0 || isSaving || (uploadMode === "replace" && (
                !replacementPreview?.ready || replacementReason.trim().length < 10 || replacementValidationErrors.length > 0
              ))}
              onClick={handleSave}
              size="sm"
              type="button"
              variant="outline"
            >
              {isSaving ? "저장 중..." : uploadMode === "replace" ? "오류 원장 교체 확정" : createBankTransactions ? "거래내역 저장" : "저장 데이터 확인"}
            </Button>
          </div>
          {saveMessage ? <p className="mx-4 mt-4 rounded-lg bg-[var(--color-sprout)] px-3 py-2 text-sm font-semibold text-[var(--color-green-ink)]">{saveMessage}</p> : null}
          {savedTransactionIds.length ? <div className="mx-4 mt-3 flex flex-wrap gap-2">{savedTransactionIds.map((id, index) => <div className="flex flex-wrap gap-2 rounded-lg border p-2" key={id}><a className="rounded-full border border-[var(--color-deep-cobalt)] bg-white px-3 py-1.5 text-xs font-bold text-[var(--color-deep-cobalt)]" href={`/finance/exp?bankTransactionId=${encodeURIComponent(id)}`}>{index + 1}번 출금거래 사후결의 초안 작성</a><a className="rounded-full border bg-white px-3 py-1.5 text-xs font-bold" href={quickExpenseEntryHref("BANK_TRANSFER", id)}>{index + 1}번 출금거래 간편 등록</a></div>)}</div> : null}
          {saveError ? <p className="mx-4 mt-4 rounded-lg bg-[var(--color-sunset-soft)] px-3 py-2 text-sm font-semibold text-[var(--color-tangerine)]">{saveError}</p> : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
              <thead className="bg-[var(--color-cloud-veil)] text-xs font-semibold text-[var(--color-stone)]">
                <tr>
                  <th className="px-4 py-3 text-center">거래일시</th>
                  <th className="px-4 py-3 text-center">계좌</th>
                  <th className="px-4 py-3 text-center">입출금</th>
                  <th className="px-4 py-3 text-center">적요</th>
                  <th className="px-4 py-3 text-center">입금</th>
                  <th className="px-4 py-3 text-center">출금</th>
                  <th className="px-4 py-3 text-center">잔액</th>
                  <th className="px-4 py-3 text-center">항</th>
                  <th className="px-4 py-3 text-center">목/추천 계정</th>
                  <th className="px-4 py-3 text-center">상태</th>
                  <th className="px-4 py-3 text-center">거래점</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-soft-border)]">
                {previewRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-[var(--color-stone)]" colSpan={11}>
                      파일을 선택하거나 표를 붙여넣은 뒤 미리보기를 생성해 주세요.
                    </td>
                  </tr>
                ) : (
                  previewRows.map((row, index) => (
                    <tr className="bg-white/70" key={`${row.transactedAt}-${index}`}>
                      <td className="px-4 py-4 text-[var(--color-stone)]">{formatDisplayDate(row.transactedAt)}</td>
                      <td className="px-4 py-4 font-semibold">{row.bankAccountName}</td>
                      <td className="px-4 py-4">{row.transactionKind ?? "미확정"}</td>
                      <td className="px-4 py-4 text-[var(--color-stone)]">{row.description}</td>
                      <td className="px-4 py-4 text-right">{row.depositAmount ? formatKrw(row.depositAmount) : "-"}</td>
                      <td className="px-4 py-4 text-right">{row.withdrawalAmount ? formatKrw(row.withdrawalAmount) : "-"}</td>
                      <td className="px-4 py-4 text-right">{row.balanceAmount === null ? "-" : formatKrw(row.balanceAmount)}</td>
                      <td className="px-4 py-4">{row.uploadedMajorCategory || "-"}</td>
                      <td className="px-4 py-4 font-semibold">{row.recommendedAccountSubjectName ?? row.uploadedAccountTitle ?? "-"}</td>
                      <td className="px-4 py-4">
                        <Badge value={row.matchStatus} />
                      </td>
                      <td className="px-4 py-4 text-[var(--color-stone)]">{row.branchName || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </ErpShell>
  );
}

function splitLine(line: string, delimiter: string) {
  return line.split(delimiter).map((cell) => cell.trim());
}

function formatDisplayDate(value: string) {
  return value.replace("T", " ").replace(":00.000+09:00", "");
}

function SheetImportHistory({
  bankAccounts,
  history,
}: {
  bankAccounts: RegisteredBankAccount[];
  history: BankTransactionSheetImportHistoryEntry[];
}) {
  const accounts = new Map(bankAccounts.map((account) => [account.id, account]));
  return (
    <section aria-label="최근 업로드·증분 반영 이력" className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-soft-border)] p-5">
        <div>
          <div className="flex items-center gap-2">
            <History className="size-5 text-[var(--color-deep-cobalt)]" />
            <h2 className="text-lg font-bold">최근 업로드·증분 반영 이력</h2>
          </div>
          <p className="mt-1 text-sm leading-6 text-[var(--color-stone)]">
            상단 미리보기와 별개로 ERP 전체 거래와 원본 구성을 보여줘. Ledger 원본 연계와 Google 시트 신규는 모두 ERP 거래에 포함돼.
          </p>
        </div>
        <span className="rounded-full bg-[var(--color-morning-tint)] px-3 py-1 text-xs font-bold text-[var(--color-deep-cobalt)]">
          읽기 전용 감사 이력
        </span>
      </div>

      {!history.length ? (
        <p className="px-5 py-8 text-center text-sm text-[var(--color-stone)]">표시할 시트 증분 반영 이력이 없어.</p>
      ) : (
        <div className="divide-y divide-[var(--color-soft-border)]">
          {history.map((entry) => {
            const account = accounts.get(entry.bankAccountId);
            return (
              <article className="grid gap-4 p-5 xl:grid-cols-[minmax(240px,1.25fr)_repeat(4,minmax(120px,.7fr))_minmax(210px,1fr)] xl:items-center" key={entry.batchId}>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[var(--color-sprout)] px-2.5 py-1 text-xs font-bold text-[var(--color-green-ink)]">시트 증분 반영</span>
                    <span className="text-xs font-semibold text-[var(--color-stone)]">{formatHistoryDate(entry.importedAt)}</span>
                  </div>
                  <p className="mt-2 font-bold text-[var(--color-midnight-ink)]">{historyAccountLabel(account, entry.bankAccountId)}</p>
                  <p className="mt-1 text-xs text-[var(--color-stone)]">담당자 {entry.actorLabel} · 원본 {entry.sourceSheet} {entry.sourceRowCount.toLocaleString("ko-KR")}행</p>
                </div>
                <HistoryMetric label="전체 ERP 거래" value={`${entry.currentTransactionCount.toLocaleString("ko-KR")}건`} strong />
                <HistoryMetric label="Ledger 원본 연계" value={`${entry.ledgerSourceCount.toLocaleString("ko-KR")}건`} />
                <HistoryMetric label="Google 시트 신규" value={`${entry.googleSheetSourceCount.toLocaleString("ko-KR")}건`} />
                <HistoryMetric label="기타 원본" value={`${entry.otherSourceCount.toLocaleString("ko-KR")}건`} />
                <div className="flex flex-col gap-2 text-sm">
                  <p className="text-xs leading-5 text-[var(--color-stone)]">
                    이번 반영: 기존 연결 {entry.matchedCount.toLocaleString("ko-KR")}건 · 신규 추가 {entry.insertedCount.toLocaleString("ko-KR")}건
                  </p>
                  <p className="text-xs leading-5 text-[var(--color-stone)]">
                    수동 연결 {entry.manualMatchCount.toLocaleString("ko-KR")}건 · 0원 제외 {entry.skippedCount.toLocaleString("ko-KR")}건 · 표시 보정 {entry.fieldOverrideCount.toLocaleString("ko-KR")}건
                  </p>
                  <p className="text-xs leading-5 text-[var(--color-stone)]">ERP 원본만 {entry.erpOnlyCount.toLocaleString("ko-KR")}건 보존</p>
                  <p className="text-xs leading-5 text-[var(--color-stone)]">
                    입금 {formatKrw(entry.sourceDepositTotal)} · 출금 {formatKrw(entry.sourceWithdrawalTotal)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link className="rounded-full bg-[var(--color-pressed-charcoal)] px-3 py-2 text-xs font-bold text-white" href={`/finance/bank-transactions?accountId=${encodeURIComponent(entry.bankAccountId)}`}>
                      ERP 거래 보기
                    </Link>
                    <a className="rounded-full border border-[var(--color-soft-border)] bg-white px-3 py-2 text-xs font-bold" href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(entry.sourceDocumentId)}/edit`} rel="noreferrer" target="_blank">
                      원본 시트
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function HistoryMetric({ label, strong = false, value }: { label: string; strong?: boolean; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--color-cloud-veil)] px-3 py-3 text-center">
      <p className="text-xs font-semibold text-[var(--color-stone)]">{label}</p>
      <p className={`mt-1 tabular-nums ${strong ? "text-lg font-black text-[var(--color-deep-cobalt)]" : "font-bold"}`}>{value}</p>
    </div>
  );
}

function historyAccountLabel(account: RegisteredBankAccount | undefined, fallbackId: string) {
  if (!account) return `계좌 ${fallbackId}`;
  const digits = account.accountNo.replace(/\D/g, "");
  return `${account.accountName} · ${account.bankName}${digits ? ` (${digits.slice(0, 5)})` : ""}`;
}

function formatHistoryDate(value: string) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).formatToParts(new Date(value));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day} ${byType.hour}:${byType.minute}`;
}

function Badge({ value }: { value: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[value] ?? "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]"}`}>
      {value}
    </span>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
      <p className="text-sm font-semibold text-[var(--color-stone)]">{label}</p>
      <p className="mt-3 text-2xl font-bold">{value}</p>
    </div>
  );
}
