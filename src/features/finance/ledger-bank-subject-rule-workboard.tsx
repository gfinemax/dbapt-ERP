"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { RegisteredAccountSubject } from "@/features/basic-info/account-subject-data";
import { formatKrw } from "./finance-data";
import {
  buildLedgerAccountSubjectSyncInputs,
  type LedgerAccountSubjectSyncInput,
  type LedgerAccountSubjectSyncResult,
  type LedgerBankSubjectRuleGroup,
  type LedgerBankSubjectRuleInput,
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
  loadError?: string;
  saveRules?: (rules: LedgerBankSubjectRuleInput[]) => Promise<{ recommended_count: number; saved_count: number }>;
  syncAccountSubjects?: (items: LedgerAccountSubjectSyncInput[]) => Promise<LedgerAccountSubjectSyncResult>;
};

function initialAssignment(group: LedgerBankSubjectRuleGroup) {
  if (group.ruleStatus === "TRANSFER") return transferValue;
  if (group.ruleStatus === "POLICY_REVIEW") return reviewValue;
  if (!group.ruleStatus && group.syncStatus === "TRANSFER") return transferValue;
  if (!group.ruleStatus && group.syncStatus === "POLICY_REVIEW") return reviewValue;
  return group.ruleAccountSubjectId ?? group.candidateAccountSubjectId ?? "";
}

export function LedgerBankSubjectRuleWorkboardPanel({ accountSubjects, initialWorkboard, loadError, saveRules, syncAccountSubjects }: Props) {
  const [activeType, setActiveType] = useState<"CATEGORY" | "DESCRIPTION">("CATEGORY");
  const [assignments, setAssignments] = useState<Record<string, string>>(() => Object.fromEntries(
    [...initialWorkboard.categoryGroups, ...initialWorkboard.descriptionGroups].map((group) => [group.id, initialAssignment(group)]),
  ));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [showOneOffs, setShowOneOffs] = useState(false);
  const [page, setPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  async function syncAllAccountSubjects() {
    if (!syncAccountSubjects || !initialWorkboard.categoryGroups.length) return;
    setIsSyncing(true);
    setError(null);
    setMessage(null);
    try {
      const result = await syncAccountSubjects(buildLedgerAccountSubjectSyncInputs(initialWorkboard));
      setMessage(`Ledger ${result.saved_count}개를 동기화했어. 기존 연결 ${result.matched_count}개 · 신규 등록 ${result.created_count}개 · 검토 유지 ${result.review_count}개 · 계좌간이체 ${result.transfer_count}개야.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ledger 계정과목 동기화에 실패했어.");
    } finally {
      setIsSyncing(false);
    }
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
    <section aria-label="Ledger 계정과목 매핑 작업대" className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)]" id="ledger-subject-rule-workboard">
      <div className="border-b border-[var(--color-soft-border)] p-5">
        <h2 className="text-lg font-bold">Ledger 계정과목 매핑 작업대</h2>
        <p className="mt-1 text-sm text-[var(--color-stone)]">거래를 한 건씩 고치지 않고 Ledger 분류 ID 또는 반복 적요를 ERP 계정과목에 한 번만 연결해 추천값을 채워.</p>
        <p className="mt-1 text-sm text-[var(--color-stone)]">동일한 이름은 기존 ERP 계정과목에 연결하고, 없는 Ledger 항목만 새로 등록해. 확인필요와 계좌간이체는 계정과목으로 만들지 않아.</p>
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
        <Button disabled={!syncAccountSubjects || !initialWorkboard.categoryGroups.length || isSyncing} onClick={syncAllAccountSubjects} size="sm" type="button" variant="outline">{isSyncing ? "동기화 중..." : `Ledger ${initialWorkboard.categoryGroups.length}개 ERP 동기화`}</Button>
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
              <tr className="bg-white/70" key={group.id}>
                <td className="px-4 py-4 text-center"><input aria-label={`${group.sourceLabel} 규칙 선택`} checked={selectedIds.includes(group.id)} onChange={() => toggle(group.id)} type="checkbox" /></td>
                <td className="px-4 py-4"><p className="font-semibold">{group.sourceGroup ? `${group.sourceGroup} · ` : ""}{group.sourceLabel}</p><p className="text-xs text-[var(--color-stone)]">{group.matchType === "CATEGORY" ? `category_id ${group.sourceKey}` : "정규화 적요 그룹"}</p></td>
                <td className="px-4 py-4 text-center">{group.direction === "DEPOSIT" ? "입금" : "출금"}</td>
                <td className="px-4 py-4 text-right font-semibold">{group.transactionCount.toLocaleString("ko-KR")}건</td>
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
