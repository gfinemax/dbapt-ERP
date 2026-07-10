"use client";

import { FileSpreadsheet, Upload } from "lucide-react";
import { type ChangeEvent, useMemo, useState } from "react";

import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import type { RegisteredAccountSubject } from "@/features/basic-info/account-subject-data";
import { registeredAccountSubjects } from "@/features/basic-info/account-subject-data";
import type { RegisteredBankAccount } from "@/features/basic-info/business-partner-data";
import { registeredBankAccounts } from "@/features/basic-info/business-partner-data";
import { formatKrw } from "./finance-data";
import { parseBankTransactionRows, type ParsedBankTransactionRow } from "./bank-transaction-import";
import { readBankTransactionFile } from "./bank-transaction-file";

const sampleTable = [
  "항\t목\t거래일자\t거래시간\t거래종류\t적요\t입금\t출금\t잔액\t취급점",
  "운영비\t통신비\t2026/07/04\t10:31\t지급\tKT 인터넷 요금\t\t55,000\t12,000,000\t우리은행",
  "분양제비용\tM/H 설치비\t2026/07/05\t11:00\t지급\t모델하우스 설치\t\t900,000\t11,100,000\t신한은행",
].join("\n");

const statusClasses: Record<string, string> = {
  미분류: "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]",
  신규후보: "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
  업로드분류: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  자동추천: "bg-[var(--color-morning-tint)] text-[var(--color-deep-cobalt)]",
};

type BankTransactionUploadPageProps = {
  createBankTransactions?: (rows: ParsedBankTransactionRow[]) => Promise<Array<{ id: string }>>;
  initialAccountSubjects?: RegisteredAccountSubject[];
  initialBankAccounts?: RegisteredBankAccount[];
};

export function BankTransactionUploadPage({
  createBankTransactions,
  initialAccountSubjects = registeredAccountSubjects,
  initialBankAccounts = registeredBankAccounts,
}: BankTransactionUploadPageProps = {}) {
  const bankAccounts = initialBankAccounts.length > 0 ? initialBankAccounts : registeredBankAccounts;
  const accountSubjects = initialAccountSubjects.length > 0 ? initialAccountSubjects : registeredAccountSubjects;
  const [selectedAccountId, setSelectedAccountId] = useState(bankAccounts[1]?.id ?? bankAccounts[0]?.id ?? "");
  const [tableText, setTableText] = useState(sampleTable);
  const [previewRows, setPreviewRows] = useState<ParsedBankTransactionRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
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
      if (createBankTransactions) {
        await createBankTransactions(previewRows);
      }

      setSaveMessage(`${previewRows.length}건 저장 준비가 완료되었습니다. 전표 생성은 다음 단계에서 별도로 처리합니다.`);
    } catch {
      setSaveError("거래내역 저장 처리에 실패했습니다. 계좌와 Supabase 연결 상태를 확인해 주세요.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ErpShell activeDetailLabel="은행 거래내역" activeLabel="회계/자금" activeWorkspaceLabel="은행·카드">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6">
        <section className="flex flex-col gap-4 rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 lg:flex-row lg:items-end lg:justify-between lg:p-7">
          <div>
            <p className="mb-3 inline-flex rounded-full bg-[var(--color-morning-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]">
              회계/자금 &gt; 은행·카드 &gt; 은행 거래내역
            </p>
            <h1 className="text-3xl font-bold tracking-normal">은행 거래내역 업로드</h1>
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

        <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
          <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
            <label className="grid gap-2 text-sm font-semibold" htmlFor="bank-upload-account">
              업로드 대상 계좌
              <select
                className="h-11 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm font-medium text-[var(--color-midnight-ink)]"
                id="bank-upload-account"
                onChange={(event) => setSelectedAccountId(event.target.value)}
                value={selectedAccountId}
              >
                {bankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.accountName}
                  </option>
                ))}
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
            <p className="mt-3 text-sm text-[var(--color-stone)]">엑셀 파일, 탭 구분, CSV 형식으로 입력할 수 있습니다. 헤더는 항, 목, 거래일자, 거래시간, 거래종류, 적요, 입금, 출금, 잔액, 거래점/취급점을 인식합니다.</p>
            {parseError ? <p className="mt-3 rounded-lg bg-[var(--color-sunset-soft)] px-3 py-2 text-sm font-semibold text-[var(--color-tangerine)]">{parseError}</p> : null}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-soft-border)] p-4">
            <div>
              <h2 className="text-lg font-bold">업로드 미리보기</h2>
              <p className="mt-1 text-sm text-[var(--color-stone)]">자동 전표 생성 전 단계이며, 여기서는 계정과목 후보와 신규 후보만 확인합니다.</p>
            </div>
            <Button className="rounded-full" disabled={previewRows.length === 0 || isSaving} onClick={handleSave} size="sm" type="button" variant="outline">
              {isSaving ? "저장 중..." : createBankTransactions ? "거래내역 저장" : "저장 데이터 확인"}
            </Button>
          </div>
          {saveMessage ? <p className="mx-4 mt-4 rounded-lg bg-[var(--color-sprout)] px-3 py-2 text-sm font-semibold text-[var(--color-green-ink)]">{saveMessage}</p> : null}
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
                      <td className="px-4 py-4">{row.transactionKind}</td>
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
