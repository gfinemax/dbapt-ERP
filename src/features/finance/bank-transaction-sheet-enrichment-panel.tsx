"use client";

import { ExternalLink, FileCheck2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type ReactNode, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { RegisteredBankAccount } from "@/features/basic-info/business-partner-data";
import {
  defaultBankSheetDocumentId,
  defaultBankSheetName,
  parseBankSheetText,
  type BankSheetEnrichmentPreview,
  type BankSheetEnrichmentResult,
  type BankSheetSourceRow,
} from "./bank-transaction-sheet-enrichment";
import type { ApplyBankSheetEnrichmentInput } from "./bank-transaction-sheet-enrichment-repository";
import { formatKrw } from "./finance-data";

type Props = {
  applyEnrichment?: (input: ApplyBankSheetEnrichmentInput) => Promise<BankSheetEnrichmentResult>;
  bankAccounts: RegisteredBankAccount[];
  previewEnrichment?: (input: { bankAccountId: string; sourceRows: BankSheetSourceRow[] }) => Promise<BankSheetEnrichmentPreview>;
};

const defaultReason = "기업(07111) Google 시트의 적요·항목구분·메모 보정 및 신규 거래 반영";

export function BankTransactionSheetEnrichmentPanel({ applyEnrichment, bankAccounts, previewEnrichment }: Props) {
  const router = useRouter();
  const targetAccount = bankAccounts.find((account) => account.accountNo.replace(/\D/g, "").startsWith("07111426104017"))
    ?? bankAccounts.find((account) => account.accountName.includes("기업"))
    ?? bankAccounts[0];
  const [accountId, setAccountId] = useState(targetAccount?.id ?? "");
  const [sourceDocumentId, setSourceDocumentId] = useState(defaultBankSheetDocumentId);
  const [sourceSheet, setSourceSheet] = useState(defaultBankSheetName);
  const [reason, setReason] = useState(defaultReason);
  const [tableText, setTableText] = useState("");
  const [sourceRows, setSourceRows] = useState<BankSheetSourceRow[]>([]);
  const [preview, setPreview] = useState<BankSheetEnrichmentPreview | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const reviewRows = useMemo(() => preview?.rows.filter((row) => row.status === "REVIEW_REQUIRED") ?? [], [preview]);
  const newRows = useMemo(() => preview?.rows.filter((row) => row.status === "NEW") ?? [], [preview]);
  const skippedRows = useMemo(() => preview?.rows.filter((row) => row.status === "SKIPPED_ZERO") ?? [], [preview]);
  const selectedReviewCount = reviewRows.filter((row) => Boolean(selections[String(row.sourceRow)])).length;
  const canApply = Boolean(
    preview
    && applyEnrichment
    && reviewRows.length === selectedReviewCount
    && reason.trim().length >= 10
    && sourceDocumentId.trim()
    && sourceSheet.trim(),
  );

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const { readBankTransactionFile } = await import("./bank-transaction-file");
      const text = await readBankTransactionFile(file);
      setTableText(text);
      await createPreview(text);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "Google 시트 파일을 읽지 못했어.");
      setPreview(null);
    }
  }

  async function createPreview(nextText = tableText) {
    if (!previewEnrichment) {
      setError("관리자 또는 마감 담당자 권한으로 로그인해줘.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const parsed = parseBankSheetText(nextText);
      const result = await previewEnrichment({ bankAccountId: accountId, sourceRows: parsed });
      setSourceRows(parsed);
      setPreview(result);
      setSelections({});
    } catch (previewError) {
      setPreview(null);
      setSourceRows([]);
      setError(previewError instanceof Error ? previewError.message : "Google 시트 대조에 실패했어.");
    } finally {
      setLoading(false);
    }
  }

  async function applyPreview() {
    if (!preview || !applyEnrichment || !canApply) return;
    setApplying(true);
    setError(null);
    setMessage(null);
    try {
      const result = await applyEnrichment({
        bankAccountId: accountId,
        reason,
        selections,
        sourceDocumentId,
        sourceRows,
        sourceSheet,
      });
      setMessage(
        result.already_applied
          ? `이미 반영된 시트야. 배치 ${result.batch_id}`
          : `기존 연결 ${result.matched_count.toLocaleString("ko-KR")}건, 신규 ${result.inserted_count.toLocaleString("ko-KR")}건, 0원 제외 ${result.skipped_count.toLocaleString("ko-KR")}건을 반영했어.`,
      );
      router.refresh();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Google 시트 보정 반영에 실패했어.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <section aria-label="Google 시트 보정·증분 반영" className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-soft-border)] p-5">
        <div>
          <div className="flex items-center gap-2">
            <FileCheck2 className="size-5 text-[var(--color-deep-cobalt)]" />
            <h2 className="text-lg font-bold">Google 시트 보정·증분 반영</h2>
          </div>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--color-stone)]">
            Ledger 원본 ID는 유지하고 적요·메모·항목구분은 보정 이력으로 남겨. 날짜·시간·입출금액이 유일한 거래만 자동 연결하고, 중복·시간 누락은 직접 원본을 선택해.
          </p>
        </div>
        <a className="inline-flex items-center gap-2 rounded-full border border-[var(--color-soft-border)] px-4 py-2 text-sm font-bold" href={`https://docs.google.com/spreadsheets/d/${sourceDocumentId}/edit`} rel="noreferrer" target="_blank">
          원본 시트 <ExternalLink className="size-4" />
        </a>
      </div>

      <div className="grid gap-4 p-5 xl:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Field label="대상 ERP 계좌">
            <select className={inputClass} onChange={(event) => resetPreview(setAccountId, event.target.value)} value={accountId}>
              {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.accountName} · {account.bankName} ({firstFive(account.accountNo)})</option>)}
            </select>
          </Field>
          <Field label="Google 문서 ID"><input className={inputClass} onChange={(event) => resetPreview(setSourceDocumentId, event.target.value)} value={sourceDocumentId} /></Field>
          <Field label="시트명"><input className={inputClass} onChange={(event) => resetPreview(setSourceSheet, event.target.value)} value={sourceSheet} /></Field>
          <Field label="반영 사유"><textarea className={`${inputClass} min-h-24 py-3`} onChange={(event) => setReason(event.target.value)} value={reason} /></Field>
        </div>
        <div>
          <label className="grid gap-2 text-sm font-semibold" htmlFor="sheet-enrichment-table">
            Google 시트 표 붙여넣기
            <textarea className="min-h-52 rounded-xl border border-[var(--color-soft-border)] bg-white p-4 font-mono text-sm leading-6" id="sheet-enrichment-table" onChange={(event) => { setTableText(event.target.value); setPreview(null); }} value={tableText} />
          </label>
          <p className="mt-2 text-xs leading-5 text-[var(--color-stone)]">계좌구분, 거래일자, 거래시간, 거래종류, 적요, 입금, 출금, 항목구분, 메모 열을 인식해. 빈 메모는 기존 값을 지우지 않아.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2 text-sm font-bold">
              <Upload className="size-4" /> Google 시트 파일 선택
              <input accept=".csv,.tsv,.txt,.xlsx,.xls" className="sr-only" onChange={handleFileChange} type="file" />
            </label>
            <Button disabled={loading || !tableText.trim() || !accountId} onClick={() => createPreview()} type="button">{loading ? "대조 중..." : "전체 대조 미리보기"}</Button>
          </div>
        </div>
      </div>

      {error ? <p className="mx-5 mb-5 rounded-xl bg-[var(--color-sunset-soft)] px-4 py-3 text-sm font-bold text-[var(--color-tangerine)]" role="alert">{error}</p> : null}
      {message ? <p className="mx-5 mb-5 rounded-xl bg-[var(--color-sprout)] px-4 py-3 text-sm font-bold text-[var(--color-green-ink)]">{message}</p> : null}

      {preview ? (
        <div className="border-t border-[var(--color-soft-border)] p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Metric label="시트 전체" value={`${preview.sourceRowCount.toLocaleString("ko-KR")}건`} />
            <Metric label="자동 연결" value={`${preview.autoMatchedCount.toLocaleString("ko-KR")}건`} />
            <Metric emphasis label="연결 검토" value={`${preview.reviewRequiredCount.toLocaleString("ko-KR")}건`} />
            <Metric label="신규 추가" value={`${preview.newCount.toLocaleString("ko-KR")}건`} />
            <Metric label="0원 제외" value={`${preview.skippedZeroCount.toLocaleString("ko-KR")}건`} />
            <Metric label="ERP 원본만" value={`${preview.erpOnlyAfterResolutionCount.toLocaleString("ko-KR")}건`} />
          </div>
          <p className="mt-3 text-sm text-[var(--color-stone)]">시트 합계 · 입금 {formatKrw(preview.sourceDepositTotal)} · 출금 {formatKrw(preview.sourceWithdrawalTotal)}</p>

          {reviewRows.length ? (
            <div className="mt-6 overflow-hidden rounded-xl border border-[var(--color-butter-soft)]">
              <div className="bg-[var(--color-butter-soft)] px-4 py-3"><h3 className="font-bold">ERP 원본 선택 필요 · {selectedReviewCount}/{reviewRows.length}건</h3></div>
              <div className="divide-y divide-[var(--color-soft-border)]">
                {reviewRows.map((row) => (
                  <div className="grid gap-3 p-4 lg:grid-cols-[minmax(230px,1fr)_minmax(360px,1.5fr)] lg:items-center" key={row.sourceRow}>
                    <div><p className="font-bold">시트 {row.sourceRow}행 · {row.transactionDate} {row.transactionTime || "시간 미확인"}</p><p className="mt-1 text-sm text-[var(--color-stone)]">{row.description || "적요 없음"} · {amountLabel(row.depositAmount, row.withdrawalAmount)}</p></div>
                    <select aria-label={`시트 ${row.sourceRow}행 ERP 원본`} className={inputClass} onChange={(event) => setSelections((current) => ({ ...current, [String(row.sourceRow)]: event.target.value }))} value={selections[String(row.sourceRow)] ?? ""}>
                      <option value="">ERP 원본 ID를 선택해줘</option>
                      {row.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.transactionDate} {candidate.transactionTime} · {candidate.description || "적요 없음"} · {amountLabel(candidate.depositAmount, candidate.withdrawalAmount)} · 원본 {candidate.sourceTransactionId}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <EvidenceList label="신규로 추가할 거래" rows={newRows} />
            <EvidenceList label="0원으로 제외할 행" rows={skippedRows} />
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--color-cloud-veil)] p-4">
            <p className="text-sm leading-6 text-[var(--color-stone)]">확정된 계정과목은 덮어쓰지 않고, 빈 적요·메모는 기존 값을 유지해. 반영은 한 번의 감사 트랜잭션으로 처리돼.</p>
            <Button disabled={!canApply || applying} onClick={applyPreview} type="button">{applying ? "반영 중..." : "보정·신규 거래 반영"}</Button>
          </div>
        </div>
      ) : null}
    </section>
  );

  function resetPreview(setter: (value: string) => void, value: string) {
    setter(value);
    setPreview(null);
    setSelections({});
    setMessage(null);
  }
}

const inputClass = "h-11 w-full rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm font-medium text-[var(--color-midnight-ink)]";

function Field({ children, label }: { children: ReactNode; label: string }) {
  return <label className="grid gap-2 text-sm font-semibold">{label}{children}</label>;
}

function Metric({ emphasis = false, label, value }: { emphasis?: boolean; label: string; value: string }) {
  return <div className={`rounded-xl border p-4 ${emphasis ? "border-[var(--color-mustard)] bg-[var(--color-butter-soft)]" : "border-[var(--color-soft-border)] bg-white"}`}><p className="text-xs font-semibold text-[var(--color-stone)]">{label}</p><p className="mt-2 text-xl font-black">{value}</p></div>;
}

function EvidenceList({ label, rows }: { label: string; rows: BankSheetEnrichmentPreview["rows"] }) {
  return (
    <div className="rounded-xl border border-[var(--color-soft-border)] p-4">
      <h3 className="font-bold">{label} · {rows.length}건</h3>
      {rows.length ? <ul className="mt-3 space-y-2 text-sm text-[var(--color-stone)]">{rows.map((row) => <li key={row.sourceRow}>시트 {row.sourceRow}행 · {row.transactionDate} · {row.description || "적요 없음"} · {amountLabel(row.depositAmount, row.withdrawalAmount)}</li>)}</ul> : <p className="mt-3 text-sm text-[var(--color-stone)]">해당 행이 없어.</p>}
    </div>
  );
}

function amountLabel(depositAmount: number, withdrawalAmount: number) {
  if (depositAmount) return `입금 ${formatKrw(depositAmount)}`;
  if (withdrawalAmount) return `출금 ${formatKrw(withdrawalAmount)}`;
  return "0원";
}

function firstFive(accountNo: string) {
  return accountNo.replace(/\D/g, "").slice(0, 5) || "번호 미확인";
}
