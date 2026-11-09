"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { RegisteredAccountSubject } from "@/features/basic-info/account-subject-data";
import type {
  BankTransactionListRow,
  BankTransactionDetailOverrideInput,
  BankTransactionDetailOverrideResult,
  BankTransactionReviewAction,
  BankTransactionReviewInput,
  BankTransactionReviewResult,
  BankTransactionRulePreview,
  BankTransactionRuleScope,
} from "./bank-transaction-repository";
import { formatKrw } from "./finance-data";

type Props = {
  accountName: string;
  accountSubjects: RegisteredAccountSubject[];
  closeHref: string;
  rulePreview?: BankTransactionRulePreview;
  saveDetailOverridesAction?: (input: BankTransactionDetailOverrideInput) => Promise<BankTransactionDetailOverrideResult>;
  saveReviewAction?: (input: BankTransactionReviewInput) => Promise<BankTransactionReviewResult>;
  transaction: BankTransactionListRow;
};

const classificationLabels = {
  CONFIRMED: "확정",
  DEFERRED: "검토 보류",
  EXCLUDED: "제외",
  RECOMMENDED: "추천 있음",
  UNREVIEWED: "미확인",
} as const;

export function BankTransactionDetailDrawer({ accountName, accountSubjects, closeHref, rulePreview, saveDetailOverridesAction, saveReviewAction, transaction }: Props) {
  const router = useRouter();
  const closeRef = useRef<HTMLAnchorElement>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState(transaction.confirmedAccountSubjectId ?? transaction.recommendedAccountSubjectId ?? "");
  const [adminNote, setAdminNote] = useState(transaction.classificationNote ?? "");
  const [savedDetail, setSavedDetail] = useState(transaction.transactionDetail ?? "");
  const [detailValue, setDetailValue] = useState(transaction.transactionDetail ?? "");
  const [detailReason, setDetailReason] = useState("");
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailMessage, setDetailMessage] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [ruleScope, setRuleScope] = useState<BankTransactionRuleScope>(rulePreview ? "MATCHING_AND_FUTURE" : "SINGLE");
  const [pendingAction, setPendingAction] = useState<BankTransactionReviewAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") window.location.assign(closeHref);
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeHref]);

  const isWithdrawal = transaction.transactionKind === "출금";
  const amountLabel = isWithdrawal ? "출금" : transaction.transactionKind === "입금" ? "입금" : "금액";
  const activeSubjects = accountSubjects
    .filter((subject) => subject.isActive)
    .sort((left, right) => Number(Boolean(right.isPrimary)) - Number(Boolean(left.isPrimary)) || left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "ko-KR"));
  const detailHistory = transaction.detailOverrides?.filter((override) => override.fieldName === "TRANSACTION_DETAIL") ?? [];

  async function saveReview(action: BankTransactionReviewAction) {
    if (!saveReviewAction || pendingAction || detailSaving) return;
    if (action === "CONFIRM" && !selectedSubjectId) {
      setError("확정할 계정과목을 먼저 선택해줘.");
      return;
    }
    setPendingAction(action);
    setMessage(null);
    setError(null);
    try {
      const saved = await saveReviewAction({
        accountSubjectId: action === "CONFIRM" ? selectedSubjectId : null,
        action,
        adminNote,
        ruleScope: action === "CONFIRM" ? ruleScope : undefined,
        transactionId: transaction.id,
      });
      setAdminNote(saved.classification_note ?? "");
      setMessage(reviewSuccessMessage(action, saved));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "은행거래 검토 내용을 저장하지 못했어.");
    } finally {
      setPendingAction(null);
    }
  }

  const hasDetailChanges = detailValue.trim() !== savedDetail.trim();

  async function saveDetailOverrides() {
    if (!saveDetailOverridesAction || detailSaving || pendingAction) return;
    if (!hasDetailChanges) {
      setDetailError("수정된 거래내역이 없어.");
      return;
    }
    if (!detailValue.trim()) {
      setDetailError("거래내역을 입력해줘.");
      return;
    }
    if (detailReason.trim().length < 2) {
      setDetailError("수정 사유를 2자 이상 입력해줘.");
      return;
    }
    setDetailSaving(true);
    setDetailMessage(null);
    setDetailError(null);
    try {
      const saved = await saveDetailOverridesAction({ reason: detailReason, transactionDetail: detailValue, transactionId: transaction.id });
      setDetailValue(saved.values.TRANSACTION_DETAIL);
      setSavedDetail(saved.values.TRANSACTION_DETAIL);
      setDetailReason("");
      setDetailMessage(saved.changed_count > 0 ? "거래내역을 수정했어." : "변경된 거래내역이 없어.");
      router.refresh();
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : "ERP 거래내역을 저장하지 못했어.");
    } finally {
      setDetailSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/25" role="presentation">
      <Link aria-label="거래 상세 닫기" className="absolute inset-0" href={closeHref} />
      <aside
        aria-labelledby="bank-transaction-detail-title"
        aria-modal="true"
        className="relative z-10 h-full w-full max-w-2xl overflow-y-auto border-l border-[var(--color-soft-border)] bg-white p-6 shadow-2xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-[var(--color-deep-cobalt)]">은행거래 검토</p>
            <h2 className="mt-2 text-2xl font-bold" id="bank-transaction-detail-title">{transaction.description || "적요 없음"}</h2>
            <p className="mt-2 text-sm text-[var(--color-stone)]">업로드 원문을 참고해 ERP 거래내역·계정과목·관리자 비고를 기록해.</p>
          </div>
          <Link ref={closeRef} className="rounded-full border border-[var(--color-soft-border)] px-4 py-2 text-sm font-semibold" href={closeHref}>
            닫기
          </Link>
        </div>

        <section aria-label="은행거래 원문" className="mt-8 rounded-xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-4">
          <h3 className="font-bold">은행거래 원문</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--color-stone)]">거래일시와 금액 등 은행 원문은 읽기 전용으로 보존해.</p>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <Detail label="거래일시" value={formatDateTime(transaction.transactedAt)} />
            <Detail label="계좌" value={accountName} />
            <Detail label="입출금" value={transaction.transactionKind ?? "미확정"} />
            <Detail label={amountLabel} value={formatKrw(transaction.amount)} strong />
            <Detail label="거래 후 잔액" value={transaction.balanceAmount === null ? "-" : formatKrw(transaction.balanceAmount)} />
            <Detail label="거래처·거래점" value={[transaction.counterparty, transaction.sourceBranchName ?? transaction.branchName].filter(Boolean).join(" · ") || "-"} />
          </dl>
        </section>

        <section aria-label="업로드 참고 정보" className="mt-5 rounded-xl border border-[var(--color-morning-tint)] bg-[var(--color-morning-tint)]/35 p-4">
          <h3 className="font-bold text-[var(--color-deep-cobalt)]">업로드 참고 정보</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--color-stone)]">시트의 항목구분·메모는 추천 참고자료야. ERP 계정과목을 자동 확정하지는 않아.</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <ReferenceDetail label="항목구분" value={(transaction.sourceUploadedCategory ?? transaction.uploadedCategory) || "없음"} />
            <ReferenceDetail label="업로드 계정항목" value={(transaction.sourceUploadedAccountTitle ?? transaction.uploadedAccountTitle) || "없음"} />
            <ReferenceDetail label="업로드 메모" value={(transaction.sourceMemo ?? transaction.memo) || "없음"} wide />
            {transaction.originalDescription && transaction.originalDescription !== transaction.description ? <ReferenceDetail label="은행 원본 적요" value={transaction.originalDescription} wide /> : null}
          </dl>
        </section>

        <section aria-label="ERP 거래내역 편집" className="mt-5 rounded-xl border border-[var(--color-soft-border)] bg-white p-4 shadow-sm">
          <h3 className="font-bold">ERP 거래내역 편집</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--color-stone)]">목록의 거래내역 컬럼에 표시되는 값만 수정해. 은행·Ledger·업로드 원문은 그대로 보존하고 수정 이력을 남겨.</p>
          {saveDetailOverridesAction ? (
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1.5 text-sm font-semibold">
                거래내역
                <textarea aria-label="거래내역" className="min-h-28 resize-y rounded-lg border border-[var(--color-soft-border)] px-3 py-2 font-normal" maxLength={2000} onChange={(event) => setDetailValue(event.target.value)} value={detailValue} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold">
                수정 사유
                <input aria-label="거래내역 수정 사유" className="h-11 rounded-lg border border-[var(--color-soft-border)] px-3 font-normal" maxLength={500} onChange={(event) => setDetailReason(event.target.value)} placeholder="원문 대조 결과나 수정 근거를 입력해줘." value={detailReason} />
              </label>
              {detailMessage ? <p className="rounded-lg bg-[var(--color-sprout)] px-3 py-2 text-sm font-semibold text-[var(--color-green-ink)]" role="status">{detailMessage}</p> : null}
              {detailError ? <p className="rounded-lg bg-[var(--color-sunset-soft)] px-3 py-2 text-sm font-semibold text-[var(--color-tangerine)]" role="alert">{detailError}</p> : null}
              <div className="flex justify-end">
                <Button disabled={detailSaving || Boolean(pendingAction) || !hasDetailChanges || !detailValue.trim()} onClick={() => void saveDetailOverrides()} size="sm" type="button">{detailSaving ? "저장 중..." : "거래내역 저장"}</Button>
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-lg bg-[var(--color-cloud-veil)] p-3 text-sm text-[var(--color-stone)]">조회 권한으로 접속했어. 거래내역 표시값 수정은 관리자만 할 수 있어.</p>
          )}
        </section>

        <section aria-label="ERP 계정과목 검토" className="mt-5 rounded-xl border border-[var(--color-soft-border)] bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-bold">ERP 계정과목 검토</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--color-stone)]">현재 상태 · {classificationLabels[transaction.classificationStatus]}</p>
            </div>
            <div className="rounded-lg bg-[var(--color-cloud-veil)] px-3 py-2 text-right text-xs">
              <p className="font-bold">추천 · {transaction.recommendedAccountSubjectName ?? "없음"}</p>
              <p className="mt-1 text-[var(--color-stone)]">{transaction.recommendationReason ?? "관리자 판단 필요"}</p>
            </div>
          </div>
          {saveReviewAction ? (
            <div className="mt-4 grid gap-4">
              <label className="grid gap-1.5 text-sm font-semibold">
                ERP 계정과목
                <select
                  aria-label="ERP 계정과목"
                  className="h-11 rounded-lg border border-[var(--color-soft-border)] bg-white px-3"
                  onChange={(event) => setSelectedSubjectId(event.target.value)}
                  value={selectedSubjectId}
                >
                  <option value="">계정과목 선택</option>
                  {activeSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.businessCategory} · {subject.name}</option>)}
                </select>
              </label>
              {rulePreview ? (
                <fieldset className="rounded-xl border border-[var(--color-morning-tint)] bg-[var(--color-morning-tint)]/25 p-3">
                  <legend className="px-1 text-sm font-bold">같은 거래 적용 범위</legend>
                  <p className="mt-1 text-xs leading-5 text-[var(--color-stone)]">
                    정확히 같은 적요와 {rulePreview.direction === "WITHDRAWAL" ? "출금" : "입금"} 방향만 묶어. 보류·제외 거래와 다른 계정으로 확정된 거래는 건드리지 않아.
                  </p>
                  <div className="mt-3 rounded-lg bg-white px-3 py-2 text-sm">
                    <p className="font-bold">{rulePreview.matchText} · {rulePreview.direction === "WITHDRAWAL" ? "출금" : "입금"}</p>
                    <p className="mt-1 text-[var(--color-stone)]">현재 미확인·추천 {rulePreview.pendingCount.toLocaleString("ko-KR")}건 · 합계 {formatKrw(rulePreview.pendingAmount)}</p>
                    {rulePreview.activeRuleAccountSubjectName ? <p className="mt-1 font-semibold text-[var(--color-deep-cobalt)]">현재 자동 규칙 · {rulePreview.activeRuleAccountSubjectName}</p> : null}
                  </div>
                  <div className="mt-3 grid gap-2">
                    <RuleScopeOption checked={ruleScope === "SINGLE"} description="선택한 거래 한 건만 확정해." label="이 거래만" onChange={() => setRuleScope("SINGLE")} />
                    <RuleScopeOption checked={ruleScope === "MATCHING"} description={`현재 미확인·추천 ${rulePreview.pendingCount.toLocaleString("ko-KR")}건을 함께 확정해.`} label="현재 같은 거래 모두" onChange={() => setRuleScope("MATCHING")} />
                    <RuleScopeOption checked={ruleScope === "MATCHING_AND_FUTURE"} description="현재 같은 거래를 확정하고 앞으로 들어올 동일 거래도 자동 분류해." label="같은 거래 모두 + 앞으로 자동분류" onChange={() => setRuleScope("MATCHING_AND_FUTURE")} recommended />
                  </div>
                </fieldset>
              ) : null}
              <label className="grid gap-1.5 text-sm font-semibold">
                관리자 비고
                <textarea
                  aria-label="관리자 비고"
                  className="min-h-24 resize-y rounded-lg border border-[var(--color-soft-border)] bg-white px-3 py-2 font-normal"
                  maxLength={2000}
                  onChange={(event) => setAdminNote(event.target.value)}
                  placeholder="분류 판단 근거, 확인할 사항 등을 남겨줘."
                  value={adminNote}
                />
              </label>
              {message ? <p className="rounded-lg bg-[var(--color-sprout)] px-3 py-2 text-sm font-semibold text-[var(--color-green-ink)]" role="status">{message}</p> : null}
              {error ? <p className="rounded-lg bg-[var(--color-sunset-soft)] px-3 py-2 text-sm font-semibold text-[var(--color-tangerine)]" role="alert">{error}</p> : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button disabled={Boolean(pendingAction) || detailSaving} onClick={() => saveReview("NOTE")} size="sm" type="button" variant="outline">{pendingAction === "NOTE" ? "저장 중..." : "비고만 저장"}</Button>
                <Button disabled={Boolean(pendingAction) || detailSaving} onClick={() => saveReview("DEFER")} size="sm" type="button" variant="outline">{pendingAction === "DEFER" ? "저장 중..." : "검토 보류"}</Button>
                <Button disabled={Boolean(pendingAction) || detailSaving} onClick={() => saveReview("EXCLUDE")} size="sm" type="button" variant="outline">{pendingAction === "EXCLUDE" ? "저장 중..." : "제외"}</Button>
                <Button disabled={Boolean(pendingAction) || detailSaving} onClick={() => saveReview("CONFIRM")} size="sm" type="button">{pendingAction === "CONFIRM" ? "확정 중..." : ruleScope === "SINGLE" ? "이 거래 저장·확정" : "선택 범위 저장·확정"}</Button>
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-lg bg-[var(--color-cloud-veil)] p-3 text-sm text-[var(--color-stone)]">조회 권한으로 접속했어. 계정과목과 관리자 비고 저장은 관리자만 할 수 있어.</p>
          )}
        </section>

        {transaction.sourceReconciliationIssue ? (
          <section className="mt-5 rounded-xl border border-[var(--color-mustard)] bg-[var(--color-butter-soft)]/55 p-4" aria-label="원본 대조 상태">
            <h3 className="font-bold text-[var(--color-midnight-ink)]">원본 확인 필요</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--color-stone)]">{transaction.sourceReconciliationIssue.reason}</p>
            <dl className="mt-4 grid gap-3 text-sm">
              <ReconciliationDetail label="ERP 원본 ID" value={transaction.sourceReconciliationIssue.sourceTransactionId} />
              <ReconciliationDetail label="ERP 원본 종류" value={sourceSystemLabel(transaction.sourceReconciliationIssue.sourceSystem)} />
              <ReconciliationDetail label="마지막 대조" value={`${formatDateTime(transaction.sourceReconciliationIssue.comparedAt)} · ${transaction.sourceReconciliationIssue.sourceSheet}`} />
              <ReconciliationDetail label="집계 영향" value={reconciliationImpact(transaction.sourceReconciliationIssue.depositImpact, transaction.sourceReconciliationIssue.withdrawalImpact)} />
              <ReconciliationDetail label="후속 연결" value={transaction.sourceReconciliationIssue.downstreamLinkLabels.length ? transaction.sourceReconciliationIssue.downstreamLinkLabels.join(" · ") : "연결 없음"} />
            </dl>
            <a className="mt-4 inline-block text-sm font-bold text-[var(--color-deep-cobalt)] underline" href={`https://docs.google.com/spreadsheets/d/${transaction.sourceReconciliationIssue.sourceDocumentId}/edit`} rel="noreferrer" target="_blank">대조한 Google 시트 열기</a>
          </section>
        ) : null}

        {transaction.sheetOverrides?.length ? (
          <section className="mt-5 rounded-xl border border-[var(--color-morning-tint)] bg-[var(--color-morning-tint)]/40 p-4" aria-label="Google 시트 보정 이력">
            <h3 className="font-bold text-[var(--color-deep-cobalt)]">Google 시트 보정 이력</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--color-stone)]">Ledger 원본은 바꾸지 않고 화면·보고서 표시값만 보정했어.</p>
            <div className="mt-4 space-y-3">
              {transaction.sheetOverrides.map((override) => (
                <div className="rounded-lg bg-white p-3 text-sm" key={`${override.fieldName}-${override.sourceRow}`}>
                  <p className="font-bold">{sheetFieldLabel(override.fieldName)}</p>
                  <p className="mt-1 text-[var(--color-stone)]">원본 · {override.originalValue || "값 없음"}</p>
                  <p className="mt-1 font-semibold">보정 · {override.sourceValue}</p>
                  <a className="mt-2 inline-block text-xs font-bold text-[var(--color-deep-cobalt)] underline" href={`https://docs.google.com/spreadsheets/d/${override.sourceDocumentId}/edit`} rel="noreferrer" target="_blank">
                    {override.sourceSheet} {override.sourceRow}행 확인
                  </a>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {detailHistory.length ? (
          <section className="mt-5 rounded-xl border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)]/45 p-4" aria-label="ERP 거래내역 수정 이력">
            <h3 className="font-bold">ERP 거래내역 수정 이력</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--color-stone)]">최근 수정부터 표시해. 원본 값은 변경되지 않았어.</p>
            <div className="mt-4 space-y-3">
              {detailHistory.map((override, index) => (
                <div className="rounded-lg bg-white p-3 text-sm" key={`${override.fieldName}-${override.createdAt}-${index}`}>
                  <p className="font-bold">거래내역</p>
                  <p className="mt-1 text-[var(--color-stone)]">이전 · {override.previousValue || "값 없음"}</p>
                  <p className="mt-1 font-semibold">수정 · {override.value || "값 없음"}</p>
                  <p className="mt-2 text-xs text-[var(--color-stone)]">{override.reason} · {override.actorLabel} · {formatDateTime(override.createdAt)}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

function reviewSuccessMessage(action: BankTransactionReviewAction, saved: BankTransactionReviewResult) {
  if (action === "CONFIRM" && saved.applied_count && saved.applied_count > 1) {
    return `${saved.applied_count.toLocaleString("ko-KR")}건을 같은 계정과목으로 확정했어.${saved.rule_id ? " 앞으로 동일 거래도 자동 분류해." : ""}`;
  }
  if (action === "CONFIRM" && saved.rule_id) return "이 거래를 확정하고 앞으로 동일 거래 자동 분류 규칙을 저장했어.";
  if (action === "CONFIRM") return "계정과목과 관리자 비고를 확정했어.";
  if (action === "DEFER") return "검토 보류로 저장했어.";
  if (action === "EXCLUDE") return "회계 분류 제외로 저장했어.";
  return "관리자 비고를 저장했어.";
}

function RuleScopeOption({ checked, description, label, onChange, recommended = false }: {
  checked: boolean;
  description: string;
  label: string;
  onChange: () => void;
  recommended?: boolean;
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${checked ? "border-[var(--color-deep-cobalt)] bg-white" : "border-[var(--color-soft-border)] bg-white/70"}`}>
      <input checked={checked} className="mt-1" name="rule-scope" onChange={onChange} type="radio" />
      <span>
        <span className="font-bold">{label}{recommended ? <span className="ml-2 rounded-full bg-[var(--color-sprout)] px-2 py-0.5 text-[10px] text-[var(--color-green-ink)]">추천</span> : null}</span>
        <span className="mt-1 block text-xs font-normal leading-5 text-[var(--color-stone)]">{description}</span>
      </span>
    </label>
  );
}

function sheetFieldLabel(fieldName: "ACCOUNT_CATEGORY" | "DESCRIPTION" | "MEMO") {
  if (fieldName === "ACCOUNT_CATEGORY") return "항목구분";
  if (fieldName === "DESCRIPTION") return "적요";
  return "메모";
}

function Detail({ label, strong = false, value }: { label: string; strong?: boolean; value: string }) {
  return (
    <div className="grid gap-1 border-b border-[var(--color-soft-border)] pb-3">
      <dt className="text-xs font-semibold text-[var(--color-stone)]">{label}</dt>
      <dd className={strong ? "text-lg font-bold" : "font-semibold"}>{value}</dd>
    </div>
  );
}

function ReferenceDetail({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={wide ? "sm:col-span-2" : undefined}><dt className="text-xs font-semibold text-[var(--color-stone)]">{label}</dt><dd className="mt-1 whitespace-pre-wrap font-semibold">{value}</dd></div>;
}

function ReconciliationDetail({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[100px_1fr] gap-2"><dt className="font-semibold text-[var(--color-stone)]">{label}</dt><dd className="font-bold">{value}</dd></div>;
}

function reconciliationImpact(depositAmount: number, withdrawalAmount: number) {
  if (depositAmount) return `ERP 입금 합계가 시트보다 ${formatKrw(depositAmount)} 많음`;
  if (withdrawalAmount) return `ERP 출금 합계가 시트보다 ${formatKrw(withdrawalAmount)} 많음`;
  return "금액 영향 없음";
}

function sourceSystemLabel(value: string) {
  if (value === "dbapt-ledger") return "Ledger 연계 원본";
  if (value === "google-sheet") return "Google 시트 신규 원본";
  return value || "ERP 원본";
}

function formatDateTime(value: string) {
  return value.replace("T", " ").replace(/\.\d{3}[+-]\d{2}:\d{2}$/, "");
}
