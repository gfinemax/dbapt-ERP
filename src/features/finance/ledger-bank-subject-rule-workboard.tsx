"use client";

import { Fragment, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { RegisteredAccountSubject } from "@/features/basic-info/account-subject-data";
import { formatKrw } from "./finance-data";
import {
  type LedgerBankSubjectRuleGroup,
  type LedgerBankSubjectRuleInput,
  type LedgerBankSubjectTransactionPage,
  type LedgerBankSubjectTransactionQuery,
  type LedgerBankSubjectRuleWorkboard,
} from "./ledger-bank-subject-rules";

const reviewValue = "__POLICY_REVIEW__";
const transferValue = "__TRANSFER__";
const pageSize = 50;
const syncStatusLabels = {
  CREATED: "ERP 신규 등록",
  MATCHED: "기존 ERP 연결",
  POLICY_REVIEW: "검토 유지",
  TRANSFER: "계좌간이체",
} as const;

type Props = {
  accountSubjects: RegisteredAccountSubject[];
  initialWorkboard: LedgerBankSubjectRuleWorkboard;
  loadTransactions?: (query: LedgerBankSubjectTransactionQuery) => Promise<LedgerBankSubjectTransactionPage>;
  loadError?: string;
  saveRules?: (rules: LedgerBankSubjectRuleInput[]) => Promise<{ recommended_count: number; saved_count: number }>;
};

function initialAssignment(group: LedgerBankSubjectRuleGroup) {
  if (group.ruleStatus === "TRANSFER") return transferValue;
  if (group.ruleStatus === "POLICY_REVIEW") return reviewValue;
  if (!group.ruleStatus && group.syncStatus === "TRANSFER") return transferValue;
  if (!group.ruleStatus && group.syncStatus === "POLICY_REVIEW") return reviewValue;
  return group.ruleAccountSubjectId ?? group.candidateAccountSubjectId ?? "";
}

type TransactionDetailState = {
  error: string | null;
  groupId: string;
  isLoading: boolean;
  page: LedgerBankSubjectTransactionPage | null;
};

export function LedgerBankSubjectRuleWorkboardPanel({ accountSubjects, initialWorkboard, loadError, loadTransactions, saveRules }: Props) {
  const [activeType, setActiveType] = useState<"CATEGORY" | "DESCRIPTION">("CATEGORY");
  const [assignments, setAssignments] = useState<Record<string, string>>(() => Object.fromEntries(
    [...initialWorkboard.categoryGroups, ...initialWorkboard.descriptionGroups].map((group) => [group.id, initialAssignment(group)]),
  ));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [showOneOffs, setShowOneOffs] = useState(false);
  const [page, setPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [transactionDetail, setTransactionDetail] = useState<TransactionDetailState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const transactionRequestId = useRef(0);
  const activeSubjects = accountSubjects.filter((subject) => subject.isActive);
  const sourceGroups = activeType === "CATEGORY" ? initialWorkboard.categoryGroups : initialWorkboard.descriptionGroups;
  const visibleGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
    return sourceGroups.filter((group) => {
      if (activeType === "DESCRIPTION" && !showOneOffs && group.transactionCount === 1) return false;
      if (!normalizedQuery) return true;
      return [group.sourceGroup, group.sourceLabel, group.sourceKey].filter(Boolean)
        .some((value) => value!.toLocaleLowerCase("ko-KR").includes(normalizedQuery));
    });
  }, [activeType, query, showOneOffs, sourceGroups]);
  const totalPages = Math.max(1, Math.ceil(visibleGroups.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = visibleGroups.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function switchType(type: "CATEGORY" | "DESCRIPTION") {
    transactionRequestId.current += 1;
    setTransactionDetail(null);
    setActiveType(type);
    setSelectedIds([]);
    setPage(1);
  }

  function toggle(groupId: string) {
    setSelectedIds((current) => current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]);
  }

  function selectExactCandidates() {
    const candidateIds = visibleGroups
      .filter((group) => group.candidateAccountSubjectId && !group.ruleStatus)
      .map((group) => group.id);
    setSelectedIds(candidateIds);
  }

  async function loadTransactionPage(group: LedgerBankSubjectRuleGroup, page: number) {
    if (!loadTransactions) return;
    const requestId = ++transactionRequestId.current;
    setTransactionDetail((current) => ({
      error: null,
      groupId: group.id,
      isLoading: true,
      page: current?.groupId === group.id ? current.page : null,
    }));
    try {
      const result = await loadTransactions({
        direction: group.direction,
        matchType: group.matchType,
        page,
        sourceKey: group.sourceKey,
      });
      if (transactionRequestId.current !== requestId) return;
      setTransactionDetail({ error: null, groupId: group.id, isLoading: false, page: result });
    } catch (caught) {
      if (transactionRequestId.current !== requestId) return;
      setTransactionDetail((current) => ({
        error: caught instanceof Error ? caught.message : "Ledger 거래 내용을 불러오지 못했어.",
        groupId: group.id,
        isLoading: false,
        page: current?.groupId === group.id ? current.page : null,
      }));
    }
  }

  function toggleTransactions(group: LedgerBankSubjectRuleGroup) {
    if (transactionDetail?.groupId === group.id) {
      transactionRequestId.current += 1;
      setTransactionDetail(null);
      return;
    }
    void loadTransactionPage(group, 1);
  }

  async function saveSelected() {
    if (!saveRules) return;
    const groupsById = new Map([...initialWorkboard.categoryGroups, ...initialWorkboard.descriptionGroups]
      .map((group) => [group.id, group]));
    const rules = selectedIds.flatMap((id): LedgerBankSubjectRuleInput[] => {
      const group = groupsById.get(id);
      const value = assignments[id];
      if (!group || !value) return [];
      return [{
        accountSubjectId: value === reviewValue || value === transferValue ? null : value,
        direction: group.direction,
        matchType: group.matchType,
        ruleStatus: value === reviewValue ? "POLICY_REVIEW" : value === transferValue ? "TRANSFER" : "CONFIRMED",
        sourceKey: group.sourceKey,
      }];
    });
    if (!rules.length) return;
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await saveRules(rules);
      setSelectedIds([]);
      setMessage(`${result.saved_count}개 규칙을 저장했고 ${result.recommended_count.toLocaleString("ko-KR")}건에 추천값을 설정했어. 거래 확정은 아직 하지 않았어.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ledger 분류 규칙 저장에 실패했어.");
    } finally {
      setIsSaving(false);
    }
  }

  const saveableCount = selectedIds.filter((id) => assignments[id]).length;
  return (
    <section aria-label="Ledger 분류 참고 연결" className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)]" id="ledger-subject-rule-workboard">
      <div className="border-b border-[var(--color-soft-border)] p-5">
        <h2 className="text-lg font-bold">Ledger 분류 참고 연결</h2>
        <p className="mt-1 text-sm text-[var(--color-stone)]">Ledger 분류 ID와 반복 적요를 ERP 계정과목에 연결해 추천값만 채워. ERP 계정과목 원장은 여기서 생성하거나 바꾸지 않아.</p>
        <p className="mt-1 text-sm text-[var(--color-stone)]">없는 계정과목은 먼저 ERP 계정과목 관리에서 등록해. 확인필요와 계좌간이체는 자동 확정하지 않아.</p>
        <p className="mt-2 text-xs font-semibold text-[var(--color-stone)]">분류 규칙 {initialWorkboard.categoryGroups.length}개 · ERP 동기화 {initialWorkboard.syncedCategoryCount}개 · 미분류 적요 그룹 {initialWorkboard.descriptionGroups.length}개 · 적요 없음 {initialWorkboard.blankDescriptionCount.toLocaleString("ko-KR")}건 · 저장된 규칙 {initialWorkboard.savedRuleCount}개</p>
      </div>
      {loadError ? <p className="m-4 rounded-lg bg-[var(--color-butter-soft)] px-3 py-2 text-sm font-semibold" role="alert">{loadError}</p> : null}
      {message ? <p className="mx-4 mt-4 rounded-lg bg-[var(--color-sprout)] px-3 py-2 text-sm font-semibold text-[var(--color-green-ink)]">{message}</p> : null}
      {error ? <p className="mx-4 mt-4 rounded-lg bg-[var(--color-sunset-soft)] px-3 py-2 text-sm font-semibold text-[var(--color-tangerine)]" role="alert">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-soft-border)] p-4">
        <Button onClick={() => switchType("CATEGORY")} size="sm" type="button" variant={activeType === "CATEGORY" ? "default" : "outline"}>Ledger 분류 {initialWorkboard.categoryGroups.length}</Button>
        <Button onClick={() => switchType("DESCRIPTION")} size="sm" type="button" variant={activeType === "DESCRIPTION" ? "default" : "outline"}>미분류 적요 {initialWorkboard.descriptionGroups.length}</Button>
        <input aria-label="Ledger 분류 규칙 검색" className="h-9 min-w-52 flex-1 rounded-md border bg-white px-3 text-sm" onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="항목명·적요 검색" value={query} />
        {activeType === "DESCRIPTION" ? <label className="flex items-center gap-2 text-sm font-semibold"><input checked={showOneOffs} onChange={(event) => { setShowOneOffs(event.target.checked); setPage(1); }} type="checkbox" />일회성 적요 포함</label> : null}
        <Button onClick={selectExactCandidates} size="sm" type="button" variant="outline">연결 후보 전체 선택</Button>
        <Button disabled={!saveRules || !saveableCount || isSaving} onClick={saveSelected} size="sm" type="button">{isSaving ? "저장 중..." : `선택 ${saveableCount}개 추천 저장`}</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
          <thead className="bg-[var(--color-cloud-veil)] text-xs font-semibold text-[var(--color-stone)]">
            <tr><th className="px-4 py-3 text-center">선택</th><th className="px-4 py-3">Ledger 기준</th><th className="px-4 py-3 text-center">입출금</th><th className="px-4 py-3 text-right">거래</th><th className="px-4 py-3 text-right">합계</th><th className="px-4 py-3">자동 후보</th><th className="px-4 py-3">ERP 추천 규칙</th></tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-soft-border)]">
            {!pageRows.length ? <tr><td className="px-4 py-8 text-center text-[var(--color-stone)]" colSpan={7}>표시할 분류 규칙이 없어.</td></tr> : pageRows.map((group) => (
              <Fragment key={group.id}>
              <tr className="bg-white/70">
                <td className="px-4 py-4 text-center"><input aria-label={`${group.sourceLabel} 규칙 선택`} checked={selectedIds.includes(group.id)} onChange={() => toggle(group.id)} type="checkbox" /></td>
                <td className="px-4 py-4"><p className="font-semibold">{group.sourceGroup ? `${group.sourceGroup} · ` : ""}{group.sourceLabel}</p><p className="text-xs text-[var(--color-stone)]">{group.matchType === "CATEGORY" ? `category_id ${group.sourceKey}` : "정규화 적요 그룹"}</p></td>
                <td className="px-4 py-4 text-center">{group.direction === "DEPOSIT" ? "입금" : "출금"}</td>
                <td className="px-4 py-4 text-right font-semibold">
                  {loadTransactions ? <button
                    aria-controls={`ledger-transaction-detail-${group.id}`}
                    aria-expanded={transactionDetail?.groupId === group.id}
                    aria-label={`${group.sourceLabel} 거래 ${group.transactionCount.toLocaleString("ko-KR")}건 ${transactionDetail?.groupId === group.id ? "닫기" : "보기"}`}
                    className="rounded-md px-2 py-1 text-[var(--color-deep-cobalt)] underline decoration-dotted underline-offset-4 hover:bg-[var(--color-morning-tint)]"
                    onClick={() => toggleTransactions(group)}
                    type="button"
                  >{group.transactionCount.toLocaleString("ko-KR")}건</button> : `${group.transactionCount.toLocaleString("ko-KR")}건`}
                </td>
                <td className="px-4 py-4 text-right">{formatKrw(group.amountTotal)}</td>
                <td className="px-4 py-4"><p>{group.candidateAccountSubjectName ?? "일치 후보 없음"}</p>{group.syncStatus ? <p className="mt-1 text-xs font-semibold text-[var(--color-stone)]">Ledger 동기화 · {syncStatusLabels[group.syncStatus]}</p> : null}</td>
                <td className="px-4 py-4">
                  <select aria-label={`${group.sourceLabel} ERP 추천 규칙`} className="h-10 w-full rounded-md border bg-white px-3" onChange={(event) => setAssignments((current) => ({ ...current, [group.id]: event.target.value }))} value={assignments[group.id] ?? ""}>
                    <option value="">계정과목 선택</option>
                    <option value={reviewValue}>정책·예외 검토</option>
                    <option value={transferValue}>계좌간이체</option>
                    {activeSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                  </select>
                </td>
              </tr>
              {transactionDetail?.groupId === group.id ? <tr className="bg-[var(--color-cloud-veil)]/70" id={`ledger-transaction-detail-${group.id}`}>
                <td className="px-4 py-4" colSpan={7}>
                  <div aria-label={`${group.sourceLabel} 거래 내용`} className="rounded-xl border border-[var(--color-soft-border)] bg-white p-4" role="region">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="font-bold">{group.sourceLabel} 거래 내용</h3>
                        <p className="mt-1 text-xs text-[var(--color-stone)]">Ledger 원본을 읽기 전용으로 표시해.</p>
                      </div>
                      <Button onClick={() => toggleTransactions(group)} size="sm" type="button" variant="outline">닫기</Button>
                    </div>
                    {transactionDetail.isLoading && !transactionDetail.page ? <p className="py-8 text-center text-sm text-[var(--color-stone)]" role="status">거래 내용을 불러오는 중이야...</p> : null}
                    {transactionDetail.error ? <p className="mt-4 rounded-lg bg-[var(--color-sunset-soft)] px-3 py-2 text-sm font-semibold text-[var(--color-tangerine)]" role="alert">{transactionDetail.error}</p> : null}
                    {transactionDetail.page ? <>
                      <p className="mt-4 text-sm font-semibold text-[var(--color-stone)]">전체 {transactionDetail.page.totalCount.toLocaleString("ko-KR")}건 · {transactionDetail.page.page}/{transactionDetail.page.totalPages}페이지</p>
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full min-w-[920px] border-collapse text-sm">
                          <thead className="bg-[var(--color-cloud-veil)] text-xs text-[var(--color-stone)]"><tr><th className="px-3 py-2 text-left">거래일</th><th className="px-3 py-2 text-left">계좌</th><th className="px-3 py-2 text-left">적요·내용</th><th className="px-3 py-2 text-right">입금</th><th className="px-3 py-2 text-right">출금</th><th className="px-3 py-2 text-right">잔액</th></tr></thead>
                          <tbody className="divide-y divide-[var(--color-soft-border)]">
                            {!transactionDetail.page.rows.length ? <tr><td className="px-3 py-6 text-center text-[var(--color-stone)]" colSpan={6}>표시할 거래 내용이 없어.</td></tr> : transactionDetail.page.rows.map((row) => {
                              const notes = [row.memo, row.managementMemo].filter(Boolean).join(" · ");
                              return <tr key={row.sourceTransactionId}>
                                <td className="whitespace-nowrap px-3 py-3"><p>{row.transactionDate ?? "-"}</p><p className="text-xs text-[var(--color-stone)]">{row.transactionTime ?? ""}</p></td>
                                <td className="px-3 py-3"><p className="font-semibold">{row.accountName ?? "-"}</p><p className="text-xs text-[var(--color-stone)]">{row.bankName ?? ""}</p></td>
                                <td className="px-3 py-3"><p className="font-semibold">{row.description}</p>{notes ? <p className="mt-1 text-xs text-[var(--color-stone)]">{notes}</p> : null}</td>
                                <td className="whitespace-nowrap px-3 py-3 text-right">{row.depositAmount > 0 ? formatKrw(row.depositAmount) : "-"}</td>
                                <td className="whitespace-nowrap px-3 py-3 text-right">{row.withdrawalAmount > 0 ? formatKrw(row.withdrawalAmount) : "-"}</td>
                                <td className="whitespace-nowrap px-3 py-3 text-right">{row.balanceAmount === null ? "-" : formatKrw(row.balanceAmount)}</td>
                              </tr>;
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <Button disabled={transactionDetail.isLoading || transactionDetail.page.page <= 1} onClick={() => void loadTransactionPage(group, transactionDetail.page!.page - 1)} size="sm" type="button" variant="outline">이전 25건</Button>
                        {transactionDetail.isLoading ? <span className="text-xs font-semibold text-[var(--color-stone)]" role="status">불러오는 중...</span> : <span className="text-xs font-semibold text-[var(--color-stone)]">한 번에 {transactionDetail.page.pageSize}건 표시</span>}
                        <Button disabled={transactionDetail.isLoading || transactionDetail.page.page >= transactionDetail.page.totalPages} onClick={() => void loadTransactionPage(group, transactionDetail.page!.page + 1)} size="sm" type="button" variant="outline">다음 25건</Button>
                      </div>
                    </> : null}
                  </div>
                </td>
              </tr> : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-[var(--color-soft-border)] bg-white px-4 py-3 text-sm font-semibold">
        <Button disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} size="sm" type="button" variant="outline">이전</Button>
        <span className="text-[var(--color-stone)]">{visibleGroups.length.toLocaleString("ko-KR")}개 중 {currentPage}/{totalPages}페이지</span>
        <Button disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} size="sm" type="button" variant="outline">다음</Button>
      </div>
    </section>
  );
}
