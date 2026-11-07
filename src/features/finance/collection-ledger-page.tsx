"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { executeCollectionLedger, syncLedgerContributions, syncLedgerExternalRecognitions } from "@/app/finance/collections/actions";
import type { CollectionExternalRecognition, CollectionLedgerCommand, CollectionLedgerWorkspace } from "./collection-ledger-repository";
import { CollectionAssessmentImport } from "./collection-assessment-import";

const card = "rounded-2xl border border-slate-200 bg-white p-5";
const input = "min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const primary = "min-h-10 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40";
const secondary = "min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40";
const money = (value: number) => `${Number(value).toLocaleString("ko-KR")}원`;
const statusLabels = { DRAFT: "작성중", APPROVED: "환급 승인", PAID: "지급 완료", CANCELLED: "취소" } as const;
const externalLinkageLabels = {
  LINKED: "부과 연결 완료", MEMBER_LEVEL: "조합원 단위 반영", UNLINKED: "연결 전", ASSESSMENT_MISSING: "부과 연결 필요",
  MEMBER_MISMATCH: "조합원 연결 확인", EXCEEDS_ASSESSMENT: "부과액 초과 확인",
} as const;
const externalSourceLabels = {
  application_certificate: "가입신청필증", dongil_fixed_certificate: "동일건설 정액 필증",
  dongil_other: "동일건설 기타 자료", trust_account: "신탁사 입금", other: "기타 자료",
} as const;
const externalAccountingLabels = {
  confirmed_loss: "확정결손", trust_receipt: "신탁수납 · 결손 아님", pending_review: "회계 검토 필요",
} as const;
const externalRecognitionTabLabels = {
  general: "일반 외부납입",
  fixed: "정액 필증 3천만원",
  all: "전체 감사 목록",
} as const;
type ExternalRecognitionTab = keyof typeof externalRecognitionTabLabels;
type ExternalRecognitionSort = "asc" | "desc";
const fixedReceiptMemberGroupLabels = {
  all: "전체",
  registered: "등기조합원",
  withdrawn: "탈퇴·환불조합원",
  prospective: "예비조합원",
  unknown: "미확인",
} as const;
type FixedReceiptMemberGroup = keyof typeof fixedReceiptMemberGroupLabels;
const koreanMemberNameCollator = new Intl.Collator("ko-KR", { numeric: true, sensitivity: "base" });
const externalRecognitionCancelLabels: Record<string, string> = {
  duplicate_entry: "중복 입력",
  wrong_member: "잘못된 조합원",
  amount_error: "금액 오류",
  input_error: "입력 오류",
  rewrite: "재작성",
  not_eligible: "인정 대상 아님",
  other: "기타",
};
function externalRecognitionCancelReason(recognition: CollectionExternalRecognition) {
  if (recognition.status !== "CANCELLED") return null;
  const payload = recognition.source_payload;
  const sourceRecognition = payload && typeof payload.recognition === "object" && payload.recognition !== null
    ? payload.recognition as Record<string, unknown>
    : {};
  const code = typeof sourceRecognition.cancel_reason_code === "string" ? sourceRecognition.cancel_reason_code : "other";
  const detail = typeof sourceRecognition.cancel_reason_detail === "string"
    ? sourceRecognition.cancel_reason_detail
    : typeof sourceRecognition.cancel_reason === "string" ? sourceRecognition.cancel_reason : recognition.reason;
  return `${externalRecognitionCancelLabels[code] ?? code} · ${detail || "기존 취소 이관"}`;
}
function groupBy<T>(items: T[], keyOf: (item: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = grouped.get(key);
    if (group) group.push(item);
    else grouped.set(key, [item]);
  }
  return grouped;
}
function fixedReceiptMemberGroup(recognition: CollectionExternalRecognition): Exclude<FixedReceiptMemberGroup, "all"> {
  const payload = recognition.source_payload;
  const rawGroup = typeof payload.member_group === "string" ? payload.member_group : "";
  return ["registered", "withdrawn", "prospective"].includes(rawGroup)
    ? rawGroup as Exclude<FixedReceiptMemberGroup, "all" | "unknown">
    : "unknown";
}
function fixedReceiptMemberStatus(recognition: CollectionExternalRecognition) {
  const status = recognition.source_payload.member_status;
  return typeof status === "string" && status.trim() ? status.trim() : null;
}
function externalRecognitionLinkage(recognition: CollectionExternalRecognition) {
  if (recognition.status === "CANCELLED") {
    return {
      label: "취소 원본 보존",
      detail: "취소된 원본과 사유는 감사 이력으로 보존하고 ERP 연결 대상에서는 제외해.",
    };
  }
  if (recognition.source_kind !== "dongil_fixed_certificate") {
    return {
      label: externalLinkageLabels[recognition.linkage_status],
      detail: recognition.linkage_issue_detail,
    };
  }
  if (!recognition.external_member_id) {
    return {
      label: "PeopleON ID 연결 필요",
      detail: "외부 조합원 고유 ID를 연결하면 별도 부과 없이 조합원 단위 인정 원장으로 반영돼.",
    };
  }
  if (recognition.linkage_status === "ASSESSMENT_MISSING") {
    return {
      label: "조합원 단위 반영 재검토",
      detail: "정액 필증은 특정 부과 연결 없이 조합원 단위 인정 원장으로 반영해야 해.",
    };
  }
  return {
    label: externalLinkageLabels[recognition.linkage_status],
    detail: recognition.linkage_issue_detail,
  };
}

function externalSyncIssueDetail(
  sourceRecognitionId: string,
  issueDetail: string,
  recognitions: CollectionExternalRecognition[],
) {
  const recognition = recognitions.find((item) => [
    item.source_recognition_id,
    item.source_root_recognition_id,
    item.source_current_recognition_id,
  ].includes(sourceRecognitionId));
  if (!recognition) return { memberName: null, detail: issueDetail };
  if (!recognition.external_member_id) {
    return {
      memberName: recognition.member_name_snapshot,
      detail: "PeopleON 고유 ID 연결이 필요해. 연결 후 같은 원본 ID로 자동 재동기화돼.",
    };
  }
  if (recognition.source_kind === "dongil_fixed_certificate" && !recognition.source_assessment_id) {
    return {
      memberName: recognition.member_name_snapshot,
      detail: "정액 필증은 별도 부과 없이 조합원 단위 외부납입 인정으로 반영돼.",
    };
  }
  return { memberName: recognition.member_name_snapshot, detail: issueDetail };
}

export function CollectionLedgerPage({ workspace, mode }: { workspace: CollectionLedgerWorkspace; mode: "collections" | "refunds" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [externalRecognitionTab, setExternalRecognitionTab] = useState<ExternalRecognitionTab>("general");
  const [externalRecognitionSort, setExternalRecognitionSort] = useState<ExternalRecognitionSort>("asc");
  const [fixedReceiptGroup, setFixedReceiptGroup] = useState<FixedReceiptMemberGroup>("all");
  const permissions = workspace.viewer.permissions;
  const canDecide = permissions.some((permission) => ["ADMIN", "APPROVE", "CLOSE"].includes(permission));
  const canPay = permissions.some((permission) => ["ADMIN", "PAY"].includes(permission));
  const command = (kind: CollectionLedgerCommand, data: Record<string, unknown>) => {
    setMessage("");
    startTransition(async () => {
      try {
        await executeCollectionLedger(kind, data, crypto.randomUUID());
        setMessage("저장했어. 원본과 감사 이력을 유지한 상태로 다시 불러왔어.");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "처리하지 못했어.");
      }
    });
  };
  const activeAllocations = workspace.allocations.filter((allocation) => !allocation.reversed);
  const activeExternalRecognitions = workspace.external_recognitions.filter((recognition) => recognition.status === "ACTIVE");
  const confirmedLossAmount = activeExternalRecognitions.reduce((sum, recognition) => sum + Number(recognition.loss_amount || 0), 0);
  const trustReceiptAmount = activeExternalRecognitions.reduce((sum, recognition) => sum + Number(recognition.actual_fund_amount || 0), 0);
  const memberLevelCount = activeExternalRecognitions.filter((recognition) => recognition.linkage_status === "MEMBER_LEVEL").length;
  const generalExternalRecognitions = workspace.external_recognitions.filter((recognition) => recognition.source_kind !== "dongil_fixed_certificate");
  const fixedExternalRecognitions = workspace.external_recognitions.filter((recognition) => recognition.source_kind === "dongil_fixed_certificate");
  const fixedReceiptGroupSummary = (Object.keys(fixedReceiptMemberGroupLabels) as FixedReceiptMemberGroup[]).map((group) => {
    const items = group === "all"
      ? fixedExternalRecognitions
      : fixedExternalRecognitions.filter((recognition) => fixedReceiptMemberGroup(recognition) === group);
    return {
      group,
      count: items.length,
      amount: items.reduce((sum, recognition) => sum + Number(recognition.claimed_amount || 0), 0),
    };
  });
  const filteredFixedExternalRecognitions = fixedReceiptGroup === "all"
    ? fixedExternalRecognitions
    : fixedExternalRecognitions.filter((recognition) => fixedReceiptMemberGroup(recognition) === fixedReceiptGroup);
  const visibleExternalRecognitions = externalRecognitionTab === "general"
    ? generalExternalRecognitions
    : externalRecognitionTab === "fixed" ? filteredFixedExternalRecognitions : workspace.external_recognitions;
  const sortedVisibleExternalRecognitions = [...visibleExternalRecognitions].sort((left, right) => {
    const leftName = left.member_name_snapshot?.trim() ?? "";
    const rightName = right.member_name_snapshot?.trim() ?? "";
    if (!leftName && rightName) return 1;
    if (leftName && !rightName) return -1;
    const byName = koreanMemberNameCollator.compare(leftName, rightName);
    const byId = koreanMemberNameCollator.compare(left.source_root_recognition_id, right.source_root_recognition_id);
    return (byName || byId) * (externalRecognitionSort === "asc" ? 1 : -1);
  });
  const visibleActiveExternalRecognitions = visibleExternalRecognitions.filter((recognition) => recognition.status === "ACTIVE");
  const visibleRecognizedAmount = visibleActiveExternalRecognitions.reduce((sum, recognition) => sum + Number(recognition.recognized_amount || 0), 0);
  const visibleLossAmount = visibleActiveExternalRecognitions.reduce((sum, recognition) => sum + Number(recognition.loss_amount || 0), 0);
  const visibleActualFundAmount = visibleActiveExternalRecognitions.reduce((sum, recognition) => sum + Number(recognition.actual_fund_amount || 0), 0);
  const visibleCancelledCount = visibleExternalRecognitions.filter((recognition) => recognition.status === "CANCELLED" || Number(recognition.recognized_amount) === 0).length;
  const visibleReviewCount = visibleExternalRecognitions.filter((recognition) => recognition.status === "ACTIVE" && !["LINKED", "MEMBER_LEVEL"].includes(recognition.linkage_status)).length;
  const allocationsByAssessment = useMemo(() => groupBy(workspace.allocations, (allocation) => allocation.assessment_id), [workspace.allocations]);
  const recognitionsByAssessment = useMemo(() => groupBy(workspace.external_recognitions, (recognition) => recognition.assessment_id ?? "__unlinked__"), [workspace.external_recognitions]);
  const refundsByAllocation = useMemo(() => groupBy(workspace.refunds.filter((refund) => refund.status !== "CANCELLED"), (refund) => refund.source_allocation_id), [workspace.refunds]);
  const ledgerSync = workspace.ledger_sync ?? { state: null, unresolved_issues: [], sources: [] };
  const externalRecognitionSync = workspace.ledger_external_recognition_sync ?? { state: null, unresolved_issues: [], source_count: 0 };
  const sync = () => {
    setMessage("");
    startTransition(async () => {
      try {
        const result = await syncLedgerContributions();
        setMessage(`Ledger 부과 ${result.applied_count}건을 반영했어. 검토 필요 ${result.issue_count}건 · 수납 피드백 ${result.feedback_sent_count}건.`);
        router.refresh();
      } catch (error) { setMessage(error instanceof Error ? error.message : "ledger 분담금을 가져오지 못했어."); }
    });
  };
  const syncExternalRecognitions = () => {
    setMessage("");
    startTransition(async () => {
      try {
        const result = await syncLedgerExternalRecognitions();
        setMessage(`Ledger 외부 납입 인정 ${result.received_count}건을 확인해 ${result.applied_count}건 반영했어. 재검토 반영 ${result.reconciled_count}건 · 미해결 ${result.unresolved_issue_count}건.`);
        router.refresh();
      } catch (error) { setMessage(error instanceof Error ? error.message : "Ledger 외부 납입 인정을 가져오지 못했어."); }
    });
  };

  return <main className="space-y-5">
    <header className={card}>
      <p className="text-sm font-bold text-blue-700">고유 ID·실제 계좌거래 기반</p>
      <h1 className="mt-1 text-3xl font-bold">{mode === "collections" ? "분담금 수납관리" : "환급관리"}</h1>
      <p className="mt-2 text-sm text-slate-600">{mode === "collections" ? "조합원 이름이 아니라 외부 원장의 고유 ID로 부과 원본을 등록하고, 실제 입금과 비현금 외부 납입 인정을 구분해 관리해." : "원수납 배분에서 환급 결정을 만들고, 분리 승인 후 같은 금액의 실제 출금을 연결해."}</p>
      <p className="mt-2 text-xs text-slate-500">표시 이름과 조합원번호는 당시 확인용 스냅샷이며 연결 키로 사용하지 않아.</p>
    </header>

    {mode === "collections" ? <>
      {canDecide ? <section className={card} aria-label="ledger 분담금 연동">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Ledger 분담금 가져오기</h2><p className="mt-1 text-sm text-slate-600">Ledger의 부과 원본과 외부 납입 인정을 고유 ID로 동기화해. 외부 인정은 통장 입금으로 집계하지 않아.</p></div><div className="flex flex-wrap gap-2"><button className={secondary} disabled={pending} onClick={sync}>부과 변경 가져오기</button><button className={primary} disabled={pending} onClick={syncExternalRecognitions}>외부 납입 인정 가져오기</button></div></div>
        <p className="mt-3 text-xs text-slate-500">부과 커서 {ledgerSync.state?.last_cursor ?? 0} · 외부 인정 커서 {externalRecognitionSync.state?.last_cursor ?? 0} · 마지막 외부 인정 동기화 {externalRecognitionSync.state?.last_synced_at?.slice(0, 19).replace("T", " ") ?? "아직 안 함"} · 미해결 검토 {ledgerSync.unresolved_issues.length + externalRecognitionSync.unresolved_issues.length}건</p>
        {ledgerSync.unresolved_issues.length ? <details className="mt-3" open><summary className="cursor-pointer text-sm font-semibold text-amber-900">부과 연결 검토 {ledgerSync.unresolved_issues.length}건</summary><ul className="mt-2 space-y-1 text-sm text-amber-800">{ledgerSync.unresolved_issues.map((issue) => <li key={issue.id}>{issue.source_assessment_id} · {issue.issue_detail}</li>)}</ul></details> : null}
        {externalRecognitionSync.unresolved_issues.length ? <details className="mt-3" open><summary className="cursor-pointer text-sm font-semibold text-amber-900">외부납입 연결 검토 {externalRecognitionSync.unresolved_issues.length}건</summary><ul className="mt-2 space-y-1 text-sm text-amber-800">{externalRecognitionSync.unresolved_issues.map((issue) => { const display = externalSyncIssueDetail(issue.source_recognition_id, issue.issue_detail, workspace.external_recognitions); return <li key={issue.id}>{issue.source_recognition_id} · {display.memberName ? `${display.memberName} · ` : ""}{display.detail}</li>; })}</ul></details> : null}
      </section> : null}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <article className={card}><p className="text-sm text-slate-500">부과 원본</p><strong className="mt-1 block text-2xl">{workspace.assessments.length}건</strong></article>
        <article className={card}><p className="text-sm text-slate-500">실제 수납 배분</p><strong className="mt-1 block text-2xl">{activeAllocations.length}건</strong></article>
        <article className={card}><p className="text-sm text-slate-500">외부 납입 인정</p><strong className="mt-1 block text-2xl">{activeExternalRecognitions.length}건</strong></article>
        <article className={card}><p className="text-sm text-slate-500">확정결손</p><strong className="mt-1 block text-2xl">{money(confirmedLossAmount)}</strong></article>
        <article className={card}><p className="text-sm text-slate-500">신탁사 보관 수납</p><strong className="mt-1 block text-2xl">{money(trustReceiptAmount)}</strong></article>
        <article className={card}><p className="text-sm text-slate-500">미배분 통장 입금 후보</p><strong className="mt-1 block text-2xl">{workspace.deposit_candidates.length}건</strong></article>
      </section>
      {workspace.external_recognitions.length ? <details className={card}>
        <summary className="cursor-pointer text-lg font-bold">Ledger 외부 납입 인정 원장 · {workspace.external_recognitions.length}건</summary>
        <p className="mt-2 text-sm text-slate-600">각 외부납입 건은 원본 ID 하나로 관리하고, 수정·취소는 같은 원본의 현재 상태로 반영해. 기술적인 변경 ID와 동기화 순번은 상세정보에서 확인할 수 있어. 특정 부과가 없는 {memberLevelCount}건은 임의 부과를 만들지 않고 조합원 단위 원장으로 보존해.</p>
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="외부 납입 인정 원장 구분">
          {(Object.keys(externalRecognitionTabLabels) as ExternalRecognitionTab[]).map((tab) => {
            const count = tab === "general" ? generalExternalRecognitions.length : tab === "fixed" ? fixedExternalRecognitions.length : workspace.external_recognitions.length;
            const selected = externalRecognitionTab === tab;
            return <button aria-controls="external-recognition-ledger-panel" aria-selected={selected} className={selected ? primary : secondary} key={tab} onClick={() => { setExternalRecognitionTab(tab); if (tab !== "fixed") setFixedReceiptGroup("all"); }} role="tab" type="button">{externalRecognitionTabLabels[tab]} · {count}건</button>;
          })}
        </div>
        {externalRecognitionTab === "fixed" ? <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5" role="tablist" aria-label="정액 필증 현재 조합원 자격">
          {fixedReceiptGroupSummary.map(({ group, count, amount }) => {
            const selected = fixedReceiptGroup === group;
            return <button aria-controls="external-recognition-ledger-panel" aria-selected={selected} className={`rounded-xl border p-3 text-left ${selected ? "border-emerald-700 bg-emerald-50 text-emerald-950" : "border-slate-200 bg-white text-slate-800"}`} key={group} onClick={() => setFixedReceiptGroup(group)} role="tab" type="button"><strong className="block">{fixedReceiptMemberGroupLabels[group]}</strong><span className="mt-1 block text-xs">{count}건 · {money(amount)}</span></button>;
          })}
        </div> : null}
        <section aria-label={`${externalRecognitionTabLabels[externalRecognitionTab]} 요약`} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <article className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">현재 인정</p><strong className="mt-1 block">{visibleActiveExternalRecognitions.length}건 · {money(visibleRecognizedAmount)}</strong></article>
          <article className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">확정결손</p><strong className="mt-1 block">{money(visibleLossAmount)}</strong></article>
          <article className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">실제 보관 자금</p><strong className="mt-1 block">{money(visibleActualFundAmount)}</strong></article>
          <article className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">취소·0원 보존</p><strong className="mt-1 block">{visibleCancelledCount}건</strong></article>
          <article className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">연결 검토</p><strong className="mt-1 block">{visibleReviewCount}건</strong></article>
        </section>
        {externalRecognitionTab === "fixed" ? <p className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">동일건설 정액 필증은 실제 입금이 아닌 비현금 외부 납입 인정이야. 조합원 자격은 Ledger의 현재 자격을 조회용으로만 구분하며, 특정 부과를 새로 만들지 않고 조합원 단위 인정과 확정결손으로 관리해.</p> : null}
        <div className="mt-4 overflow-x-auto" id="external-recognition-ledger-panel" role="tabpanel"><table className="min-w-full text-left text-sm"><thead><tr className="border-b text-slate-500"><th aria-sort={externalRecognitionSort === "asc" ? "ascending" : "descending"} className="px-2 py-2"><button aria-label={`조합원 ${externalRecognitionSort === "asc" ? "내림차순" : "오름차순"}으로 전환`} className="inline-flex items-center gap-1 font-semibold" onClick={() => setExternalRecognitionSort((current) => current === "asc" ? "desc" : "asc")} type="button">조합원·원본 ID <span aria-hidden="true">{externalRecognitionSort === "asc" ? "▲" : "▼"}</span></button></th><th className="px-2 py-2">자료·회계 처리</th><th className="px-2 py-2 text-right">현재 인정액</th><th className="px-2 py-2">현재 상태</th><th className="px-2 py-2">ERP 연결</th><th className="px-2 py-2">변경 이력</th></tr></thead><tbody>{sortedVisibleExternalRecognitions.map((recognition) => { const cancellation = externalRecognitionCancelReason(recognition); const linked = recognition.linkage_status === "LINKED" || recognition.linkage_status === "MEMBER_LEVEL"; const linkage = externalRecognitionLinkage(recognition); const linkageClass = recognition.status === "CANCELLED" ? "bg-slate-100 text-slate-600" : linked ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"; const memberGroup = fixedReceiptMemberGroup(recognition); const memberStatus = fixedReceiptMemberStatus(recognition); return <tr className="border-b last:border-0" key={recognition.id}><td className="px-2 py-3"><strong>{recognition.member_name_snapshot ?? "조합원 연결 전"}</strong>{recognition.source_kind === "dongil_fixed_certificate" ? <p className="mt-1"><span className={`rounded-full px-2 py-1 text-xs font-bold ${memberGroup === "registered" ? "bg-emerald-50 text-emerald-700" : memberGroup === "withdrawn" ? "bg-rose-50 text-rose-700" : memberGroup === "prospective" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{fixedReceiptMemberGroupLabels[memberGroup]}</span>{memberStatus && memberStatus !== fixedReceiptMemberGroupLabels[memberGroup] ? <span className="ml-2 text-xs text-slate-500">{memberStatus}</span> : null}</p> : null}<p className="mt-1 text-xs text-slate-500">{recognition.recognized_on} · 원본 ID {recognition.source_root_recognition_id}</p></td><td className="px-2 py-3"><strong>{externalSourceLabels[recognition.source_kind]}</strong><p className={`mt-1 text-xs font-bold ${recognition.accounting_treatment === "confirmed_loss" ? "text-rose-700" : "text-emerald-700"}`}>{externalAccountingLabels[recognition.accounting_treatment]}</p><p className="mt-1 text-xs text-slate-500">실제 자금 {money(recognition.actual_fund_amount)} · 결손 {money(recognition.loss_amount)}</p></td><td className={`px-2 py-3 text-right font-bold ${recognition.status === "CANCELLED" ? "text-slate-400 line-through" : ""}`}>{money(recognition.recognized_amount)}</td><td className="px-2 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${recognition.status === "CANCELLED" ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}>{recognition.status === "CANCELLED" ? "취소" : "유효"}</span><p className="mt-2 text-xs text-slate-600">{recognition.governance_status ?? recognition.status}</p>{cancellation ? <p className="mt-1 max-w-xs text-xs font-semibold text-rose-700">취소 사유: {cancellation}</p> : null}</td><td className="px-2 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${linkageClass}`}>{linkage.label}</span>{linkage.detail ? <p className="mt-1 max-w-xs text-xs text-slate-600">{linkage.detail}</p> : null}</td><td className="px-2 py-3"><details aria-label={`${recognition.member_name_snapshot ?? "조합원"} 변경 이력 정보`}><summary className="cursor-pointer font-semibold text-slate-700">상세정보</summary><div className="mt-2 min-w-52 space-y-1 text-xs text-slate-500"><p>Ledger 원본 ID {recognition.source_recognition_id}</p><p>루트 ID {recognition.source_root_recognition_id}</p><p>현재 ID {recognition.source_current_recognition_id}</p><p>동기화 순번 v{recognition.source_version}</p><p>반영 사유 {recognition.sync_reason ?? "동기화"}</p></div></details></td></tr>; })}</tbody></table>{!visibleExternalRecognitions.length ? <p className="py-8 text-center text-sm text-slate-500">이 구분에 해당하는 외부 납입 인정이 없어.</p> : null}</div>
      </details> : null}
      {canDecide ? <section className={card}>
        <h2 className="text-xl font-bold">부과 원본 등록</h2>
        <p className="mt-1 text-sm text-slate-600">외부 조합원 원장에서 확인한 고유 ID를 그대로 입력해. 이름으로 기존 자료를 찾거나 합치지 않아.</p>
        <form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); command("ASSESSMENT_SAVE", Object.fromEntries(data)); }}>
          <label className="text-sm font-semibold">외부 조합원 고유 ID<input className={input} name="external_member_id" required /></label>
          <label className="text-sm font-semibold">표시 이름 스냅샷<input className={input} name="member_name_snapshot" required /></label>
          <label className="text-sm font-semibold">조합원번호 스냅샷<input className={input} name="member_no" /></label>
          <label className="text-sm font-semibold">부과 코드·회차<input className={input} name="assessment_code" placeholder="예: 2026-09-분담금-01" required /></label>
          <label className="text-sm font-semibold">납부기한<input className={input} name="due_date" type="date" /></label>
          <label className="text-sm font-semibold">부과액<input className={input} name="assessed_amount" type="number" min="1" step="1" required /></label>
          <button className={`${primary} md:col-span-3 md:justify-self-start`} disabled={pending}>부과 원본 저장</button>
        </form>
      </section> : null}
      {canDecide ? <CollectionAssessmentImport initialHistory={workspace.import_batches} /> : null}
      <section className="space-y-3" aria-label="분담금 부과 목록">
        {workspace.assessments.map((assessment) => {
          const remaining = Number(assessment.assessed_amount) - Number(assessment.satisfied_amount);
          const allocations = allocationsByAssessment.get(assessment.id) ?? [];
          const recognitions = recognitionsByAssessment.get(assessment.id) ?? [];
          const hasActiveAllocation = allocations.some((allocation) => !allocation.reversed);
          const hasActiveRecognition = recognitions.some((recognition) => recognition.status === "ACTIVE");
          return <article className={card} key={assessment.id}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-blue-700">{assessment.external_member_id}{assessment.member_no ? ` · ${assessment.member_no}` : ""}{assessment.source_system ? " · Ledger 연동" : ""}</p><h2 className="mt-1 text-lg font-bold">{assessment.member_name_snapshot} · {assessment.assessment_code}</h2><p className="mt-1 text-sm">부과 {money(assessment.assessed_amount)} · 실제 수납 {money(assessment.cash_allocated_amount)} · 외부 인정 {money(assessment.external_recognized_amount)} · 잔액 {money(remaining)}</p></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${assessment.status === "CANCELLED" ? "bg-slate-100 text-slate-600" : remaining === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{assessment.status === "CANCELLED" ? "부과 취소" : remaining === 0 ? "완납" : "수납 진행"}</span></div>
            {canDecide && !assessment.source_system && assessment.status === "ACTIVE" && !hasActiveAllocation && !hasActiveRecognition ? <form className="mt-3 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); command("ASSESSMENT_CANCEL", { id: assessment.id, lock_version: assessment.lock_version, reason: data.get("reason") }); }}><input className={`${input} max-w-sm`} name="reason" aria-label={`${assessment.member_name_snapshot} 부과 취소 사유`} placeholder="부과 취소 사유" required /><button className={secondary} disabled={pending}>부과 원본 취소</button></form> : null}
            {canPay && assessment.status === "ACTIVE" && remaining > 0 && workspace.deposit_candidates.length ? <form className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-3 md:grid-cols-[1fr_140px_1fr_auto]" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); command("RECEIPT_ALLOCATE", { ...Object.fromEntries(data), assessment_id: assessment.id }); }}>
              <select aria-label={`${assessment.member_name_snapshot} 입금 원본`} className={input} name="bank_transaction_id" required><option value="">실제 입금 선택</option>{workspace.deposit_candidates.map((bank) => <option key={bank.id} value={bank.id}>{bank.transacted_at.slice(0,10)} · {bank.counterparty || bank.description} · 가용 {money(bank.available_amount ?? bank.amount)}</option>)}</select>
              <input aria-label={`${assessment.member_name_snapshot} 수납 배분액`} className={input} name="amount" type="number" min="1" max={remaining} placeholder="배분액" required />
              <input aria-label={`${assessment.member_name_snapshot} 수납 확인 사유`} className={input} name="reason" placeholder="입금자·회차 확인 근거" required />
              <button className={primary} disabled={pending}>수납 배분</button>
            </form> : null}
            {recognitions.length ? <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3"><p className="text-xs font-bold text-blue-800">외부 납입 인정 · 현금수지 제외</p><ul className="mt-2 space-y-2">{recognitions.map((recognition) => { const cancellation = externalRecognitionCancelReason(recognition); return <li className="text-sm" key={recognition.id}><span className={recognition.status === "CANCELLED" ? "line-through text-slate-500" : ""}>{recognition.recognized_on} · {recognition.recognition_type} · <strong>{money(recognition.recognized_amount)}</strong> · {recognition.reason}</span>{cancellation ? <small className="mt-1 block font-semibold text-rose-700">취소 사유: {cancellation}</small> : null}</li>; })}</ul></div> : null}
            {allocations.length ? <div className="mt-4 divide-y border-t">{allocations.map((allocation) => {
              const relatedRefunds = refundsByAllocation.get(allocation.id) ?? [];
              const refundRemaining = Number(allocation.amount) - relatedRefunds.reduce((sum, refund) => sum + Number(refund.requested_amount), 0);
              const hasOpenRefund = relatedRefunds.some((refund) => refund.status === "DRAFT" || refund.status === "APPROVED");
              return <div className="py-3" key={allocation.id}><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm">{allocation.bank_date.slice(0,10)} · {allocation.bank_description} · <strong>{money(allocation.amount)}</strong>{allocation.reversed ? ` · 취소됨 (${allocation.reversal_reason})` : ""}{relatedRefunds.length ? ` · 환급 결정 ${money(Number(allocation.amount) - refundRemaining)}` : ""}</p>{canPay && !allocation.reversed && !relatedRefunds.length ? <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); command("RECEIPT_REVERSE", { id: allocation.id, reason: data.get("reason") }); }}><input className={input} name="reason" aria-label="수납 배분 취소 사유" placeholder="취소 사유" required /><button className={secondary} disabled={pending}>배분 취소</button></form> : null}</div>
              {canDecide && !allocation.reversed && !hasOpenRefund && refundRemaining > 0 ? <form className="mt-2 grid gap-2 md:grid-cols-[160px_1fr_auto]" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); command("REFUND_SAVE", { source_allocation_id: allocation.id, requested_amount: data.get("requested_amount"), reason: data.get("reason") }); }}><input className={input} name="requested_amount" aria-label="환급 결정액" type="number" min="1" max={refundRemaining} placeholder={`잔여 ${money(refundRemaining)}`} required /><input className={input} name="reason" aria-label="환급 결정 근거" placeholder="환급 결정 근거" required /><button className={secondary} disabled={pending}>환급안 작성</button></form> : null}</div>;
            })}</div> : null}
          </article>;
        })}
        {!workspace.assessments.length ? <p className={`${card} text-center text-slate-600`}>등록된 부과 원본이 없어. 외부 원장의 고유 ID를 확인한 뒤 등록해줘.</p> : null}
      </section>
    </> : <section className="space-y-3" aria-label="환급 원장 목록">
      {workspace.refunds.map((refund) => <article className={card} key={refund.id}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-blue-700">{refund.external_member_id}</p><h2 className="mt-1 text-lg font-bold">{refund.member_name_snapshot} · {money(refund.requested_amount)}</h2><p className="mt-1 text-sm text-slate-600">{refund.reason}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{statusLabels[refund.status]}</span></div>
        <div className="mt-4 flex flex-wrap gap-2">
          {canDecide && refund.status === "DRAFT" && refund.created_by !== workspace.viewer.user_id ? <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); command("REFUND_APPROVE", { id: refund.id, lock_version: refund.lock_version, reason: data.get("reason") }); }}><input className={input} name="reason" aria-label="환급 승인 근거" placeholder="승인 근거" required /><button className={primary} disabled={pending}>분리 승인</button></form> : null}
          {canPay && refund.status === "APPROVED" ? <form className="flex flex-1 flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); command("REFUND_PAY", { id: refund.id, lock_version: refund.lock_version, bank_transaction_id: data.get("bank_transaction_id") }); }}><select className={`${input} min-w-72 flex-1`} aria-label="환급 실제 출금" name="bank_transaction_id" required><option value="">{money(refund.requested_amount)} 실제 출금 선택</option>{workspace.withdrawal_candidates.filter((bank) => Number(bank.amount) === Number(refund.requested_amount)).map((bank) => <option key={bank.id} value={bank.id}>{bank.transacted_at.slice(0,10)} · {bank.counterparty || bank.description} · {money(bank.amount)}</option>)}</select><button className={primary} disabled={pending}>실제 출금 연결</button></form> : null}
          {canDecide && (refund.status === "DRAFT" || refund.status === "APPROVED") ? <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); command("REFUND_CANCEL", { id: refund.id, lock_version: refund.lock_version, reason: data.get("reason") }); }}><input className={input} name="reason" aria-label="환급 취소 사유" placeholder="취소 사유" required /><button className={secondary} disabled={pending}>환급 취소</button></form> : null}
        </div>
      </article>)}
      {!workspace.refunds.length ? <p className={`${card} text-center text-slate-600`}>작성된 환급안이 없어. 분담금 수납관리의 원수납 배분에서 시작해줘.</p> : null}
    </section>}
    {message ? <p role="status" className="rounded-xl border bg-white p-3 text-sm">{message}</p> : null}
  </main>;
}
