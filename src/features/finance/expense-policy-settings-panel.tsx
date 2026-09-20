"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  expensePolicyStatusLabels,
  recommendedExpensePolicyValues,
  type ExpensePolicyImpactPreview,
  type ExpensePolicyValues,
  type ExpensePolicyVersion,
  type ExpensePolicyWorkspace,
} from "./expense-policy-settings";

type Tab = "deadlines" | "approval" | "materiality" | "prior-year" | "history";

type Props = {
  organizationId?: string;
  workspace: ExpensePolicyWorkspace;
  saveDraft?: (input: { organizationId: string; id?: string; policy: ExpensePolicyValues; effectiveFrom: string; changeReason: string }) => Promise<void>;
  previewPolicy?: (input: { organizationId: string; policy: ExpensePolicyValues }) => Promise<ExpensePolicyImpactPreview>;
  transitionPolicy?: (input: { organizationId: string; id: string; command: "SUBMIT" | "ACTIVATE" | "END" }) => Promise<void>;
};

const tabs: { id: Tab; label: string }[] = [
  { id: "deadlines", label: "처리기한" },
  { id: "approval", label: "금액별 승인" },
  { id: "materiality", label: "회계 중요성" },
  { id: "prior-year", label: "과거연도 처리" },
  { id: "history", label: "정책 변경이력" },
];

export function ExpensePolicySettingsPanel({ organizationId, workspace, saveDraft, previewPolicy, transitionPolicy }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("deadlines");
  const [policy, setPolicy] = useState<ExpensePolicyValues>(workspace.active?.policy ?? recommendedExpensePolicyValues);
  const [effectiveFrom, setEffectiveFrom] = useState(todayKst());
  const [changeReason, setChangeReason] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [preview, setPreview] = useState(workspace.preview);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const update = <K extends keyof ExpensePolicyValues>(key: K, value: ExpensePolicyValues[K]) =>
    setPolicy((current) => ({ ...current, [key]: value }));

  const run = (operation: () => Promise<void>, success: string) => {
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        await operation();
        setMessage(success);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "처리하지 못했어.");
      }
    });
  };

  const loadVersion = (version: ExpensePolicyVersion) => {
    setPolicy(version.policy);
    setEffectiveFrom(version.effectiveFrom);
    setChangeReason(version.changeReason);
    setEditingId(version.status === "DRAFT" ? version.id : undefined);
    setTab("deadlines");
    setMessage(version.status === "DRAFT" ? `v${version.versionNo} 초안을 불러왔어.` : `v${version.versionNo}을 새 초안의 기준으로 불러왔어.`);
  };

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-blue-700">지출 운영 기준</p>
            <h2 className="mt-1 text-2xl font-bold">추천안에서 시작하고 승인 후 적용해</h2>
            <p className="mt-2 text-sm text-slate-600">추천값은 미확정 초안이야. 신규 신청에는 활성 정책만 적용되고 기존 신청과 마감월은 자동으로 바뀌지 않아.</p>
          </div>
          <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm">
            <span className="text-slate-500">현재 적용</span>
            <strong className="ml-2">{workspace.active ? `v${workspace.active.versionNo} · ${workspace.active.effectiveFrom}` : "활성 정책 없음"}</strong>
          </div>
        </div>
        <nav aria-label="지출 운영 기준 설정" className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {tabs.map((item) => <button key={item.id} aria-pressed={tab === item.id} className={`shrink-0 rounded-xl border px-4 py-2 text-sm font-bold ${tab === item.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"}`} onClick={() => setTab(item.id)} type="button">{item.label}</button>)}
        </nav>
      </div>

      {tab === "history" ? (
        <PolicyHistory disabled={pending} onLoad={loadVersion} onTransition={(version, command) => {
          if (!organizationId || !transitionPolicy) return setError("조합 또는 정책 저장소가 연결되지 않았어.");
          run(() => transitionPolicy({ command, id: version.id, organizationId }), command === "SUBMIT" ? "승인을 요청했어." : command === "ACTIVATE" ? "운영 기준을 활성화했어." : "운영 기준 버전을 종료했어.");
        }} versions={workspace.versions} />
      ) : (
        <div className="p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div><strong>{editingId ? "초안 수정 중" : "새 정책 초안"}</strong><p className="mt-1 text-sm text-blue-900">저장 후 승인 요청하고 시행일에 활성화해. 관리자가 둘 이상이면 작성자와 다른 관리자가 승인해야 해.</p></div>
            <button className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-bold text-blue-800" onClick={() => { setPolicy(recommendedExpensePolicyValues); setEditingId(undefined); setMessage("권장 초기값을 불러왔어. 아직 적용되지는 않아."); }} type="button">추천값 불러오기</button>
          </div>

          {tab === "deadlines" ? <DeadlineFields policy={policy} update={update} /> : null}
          {tab === "approval" ? <ApprovalFields policy={policy} update={update} /> : null}
          {tab === "materiality" ? <MaterialityFields policy={policy} update={update} /> : null}
          {tab === "prior-year" ? <PriorYearFields policy={policy} update={update} /> : null}

          <div className="mt-6 grid gap-4 border-t border-slate-200 pt-6 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold"><span>시행일</span><input className="h-11 rounded-lg border px-3" min={todayKst()} onChange={(event) => setEffectiveFrom(event.target.value)} type="date" value={effectiveFrom} /></label>
            <label className="grid gap-2 text-sm font-bold"><span>변경 사유</span><input className="h-11 rounded-lg border px-3" onChange={(event) => setChangeReason(event.target.value)} placeholder="예: 운영규정 의결안 반영" value={changeReason} /></label>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button disabled={pending} onClick={() => {
              if (!organizationId || !saveDraft) return setError("조합 또는 정책 저장소가 연결되지 않았어.");
              run(() => saveDraft({ changeReason, effectiveFrom, id: editingId, organizationId, policy }), editingId ? "초안을 수정했어." : "정책 초안을 저장했어.");
            }}>{pending ? "처리 중…" : editingId ? "초안 수정 저장" : "초안 저장"}</Button>
            <button className="rounded-lg border px-4 py-2 text-sm font-bold" disabled={pending} onClick={() => {
              if (!organizationId || !previewPolicy) return setError("조합 또는 정책 저장소가 연결되지 않았어.");
              setError("");
              startTransition(async () => { try { setPreview(await previewPolicy({ organizationId, policy })); setMessage("현재 미처리 건에 대한 영향을 계산했어."); } catch (caught) { setError(caught instanceof Error ? caught.message : "영향을 계산하지 못했어."); } });
            }} type="button">영향 미리보기</button>
          </div>
          {message ? <p aria-live="polite" className="mt-4 rounded-lg bg-green-50 p-3 text-sm font-bold text-green-800">{message}</p> : null}
          {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}
          <ImpactPreview preview={preview} />
        </div>
      )}
    </section>
  );
}

function DeadlineFields({ policy, update }: FieldProps) {
  return <div className="grid gap-4 md:grid-cols-2"><NumberField label="정상 접수 기한" suffix="일 이내" value={policy.normalDays} onChange={(value) => update("normalDays", value)} /><NumberField label="지연 접수 종료" suffix="일" value={policy.delayedDays} onChange={(value) => update("delayedDays", value)} /><NumberField label="장기 지연 기준" suffix="일" value={policy.longDelayDays} onChange={(value) => update("longDelayDays", value)} /><NumberField label="원칙적 거절 기준" suffix="일 초과" value={policy.rejectAfterDays} onChange={(value) => update("rejectAfterDays", value)} /><Toggle checked={policy.allowLateException} label="객관적 증빙과 불가피한 사유가 있으면 예외심사 허용" onChange={(value) => update("allowLateException", value)} wide /></div>;
}

function ApprovalFields({ policy, update }: FieldProps) {
  return <div className="grid gap-4 md:grid-cols-2"><NumberField label="간소 승인 한도" suffix="원 이하" value={policy.simpleApprovalMax} onChange={(value) => update("simpleApprovalMax", value)} /><NumberField label="일반 승인 한도" suffix="원 이하" value={policy.generalApprovalMax} onChange={(value) => update("generalApprovalMax", value)} /><Toggle checked={policy.outOfBudgetSeparateApproval} label="예산 외 지출은 별도 승인" onChange={(value) => update("outOfBudgetSeparateApproval", value)} /><Toggle checked={policy.trustBusinessSeparateApproval} label="신탁 사업비는 별도 승인" onChange={(value) => update("trustBusinessSeparateApproval", value)} /><Toggle checked={policy.relatedPartySeparateApproval} label="특수관계인 거래는 별도 승인" onChange={(value) => update("relatedPartySeparateApproval", value)} /></div>;
}

function MaterialityFields({ policy, update }: FieldProps) {
  return <div className="grid gap-4 md:grid-cols-2"><NumberField label="중요성 검토 금액" suffix="원 이상" value={policy.materialityAmount} onChange={(value) => update("materialityAmount", value)} /><NumberField label="월 예산 대비 중요성 비율" suffix="% 이상" value={policy.materialityMonthlyBudgetPercent} onChange={(value) => update("materialityMonthlyBudgetPercent", value)} /><Toggle checked={policy.materialityBudgetOverrun} label="예산 초과·전용" onChange={(value) => update("materialityBudgetOverrun", value)} /><Toggle checked={policy.materialityTrustBusiness} label="신탁 사업비" onChange={(value) => update("materialityTrustBusiness", value)} /><Toggle checked={policy.materialityRelatedParty} label="특수관계인 거래" onChange={(value) => update("materialityRelatedParty", value)} /><Toggle checked={policy.materialityFraudOrDuplicate} label="부정·중복 가능성" onChange={(value) => update("materialityFraudOrDuplicate", value)} /><Toggle checked={policy.materialityReportedResultChange} label="보고 결과 변경" onChange={(value) => update("materialityReportedResultChange", value)} /><Toggle checked={policy.materialityAuditImpact} label="감사·세무 영향" onChange={(value) => update("materialityAuditImpact", value)} /></div>;
}

function PriorYearFields({ policy, update }: FieldProps) {
  return <div><div className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">권장 경로: 회계 확인 → 상위 예외승인 → 외부 회계전문가 검토 → 필요한 경우 이사회·총회 보고 또는 의결 → 지급</div><div className="grid gap-4 md:grid-cols-2"><Toggle checked={policy.blockPriorYearGeneralSubmission} label="과거연도 일반 접수 차단" onChange={(value) => update("blockPriorYearGeneralSubmission", value)} /><Toggle checked={policy.requireAccountingReview} label="회계 확인 필수" onChange={(value) => update("requireAccountingReview", value)} /><Toggle checked={policy.requireSeniorExceptionApproval} label="상위 예외승인 필수" onChange={(value) => update("requireSeniorExceptionApproval", value)} /><Toggle checked={policy.requireExternalAccountantReview} label="외부 회계전문가 검토 필수" onChange={(value) => update("requireExternalAccountantReview", value)} /><Toggle checked={policy.requireBoardWhenNeeded} label="중요 시 이사회·총회 보고 또는 의결" onChange={(value) => update("requireBoardWhenNeeded", value)} /></div></div>;
}

type FieldProps = { policy: ExpensePolicyValues; update: <K extends keyof ExpensePolicyValues>(key: K, value: ExpensePolicyValues[K]) => void };

function NumberField({ label, onChange, suffix, value }: { label: string; onChange: (value: number) => void; suffix: string; value: number }) {
  return <label className="grid gap-2 text-sm font-bold"><span>{label}</span><div className="flex items-center rounded-lg border bg-white"><input aria-label={label} className="h-11 min-w-0 flex-1 rounded-lg px-3" min="0" onChange={(event) => onChange(Number(event.target.value))} type="number" value={value} /><span className="pr-3 text-xs text-slate-500">{suffix}</span></div><span className="text-xs font-medium text-slate-500">{value.toLocaleString("ko-KR")}{suffix}</span></label>;
}

function Toggle({ checked, label, onChange, wide = false }: { checked: boolean; label: string; onChange: (value: boolean) => void; wide?: boolean }) {
  return <label className={`flex min-h-14 items-center gap-3 rounded-xl border p-4 text-sm font-bold ${wide ? "md:col-span-2" : ""}`}><input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />{label}</label>;
}

function ImpactPreview({ preview }: { preview: ExpensePolicyImpactPreview }) {
  const items = [["미처리 지출결의", preview.pendingExpenseResolutions], ["미처리 간편지출", preview.pendingQuickExpenses], ["심사 중 개인정산", preview.pendingReimbursements], ["지연 예상", preview.delayedReimbursements], ["장기 지연 예상", preview.longDelayedReimbursements], ["과거연도", preview.priorYearReimbursements]] as const;
  return <section aria-label="정책 영향 미리보기" className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4"><h3 className="font-bold">영향 미리보기</h3><p className="mt-1 text-xs text-slate-600">표시된 건은 자동 변경되지 않아. 활성화 후에도 진행 중인 신청은 별도 승인 없이 소급 적용하지 않아.</p><div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">{items.map(([label, count]) => <div className="rounded-lg bg-white p-3" key={label}><span className="block text-xs text-slate-500">{label}</span><strong className="mt-1 block text-lg">{count.toLocaleString("ko-KR")}건</strong></div>)}</div></section>;
}

function PolicyHistory({ disabled, onLoad, onTransition, versions }: { disabled: boolean; onLoad: (version: ExpensePolicyVersion) => void; onTransition: (version: ExpensePolicyVersion, command: "SUBMIT" | "ACTIVATE" | "END") => void; versions: ExpensePolicyVersion[] }) {
  return <div className="p-5 sm:p-6"><p className="mb-4 text-sm text-slate-600">모든 버전의 작성자·승인자·시행기간을 보존해. 관리자가 둘 이상이면 초안 작성자와 다른 관리자가 활성 승인해.</p>{versions.length ? <div className="grid gap-3">{versions.map((version) => <article className="rounded-xl border p-4" key={version.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><strong>v{version.versionNo}</strong><span className={`rounded-full px-2 py-1 text-xs font-bold ${version.status === "ACTIVE" ? "bg-green-100 text-green-800" : version.status === "PENDING" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>{expensePolicyStatusLabels[version.status]}</span></div><p className="mt-2 font-bold">{version.changeReason}</p><p className="mt-1 text-xs text-slate-500">시행 {version.effectiveFrom}{version.effectiveTo ? ` ~ ${version.effectiveTo}` : ""} · 작성 {version.createdByLabel}{version.approvedByLabel ? ` · 승인 ${version.approvedByLabel}` : ""}</p></div><div className="flex flex-wrap gap-2"><button className="rounded-lg border px-3 py-2 text-sm font-bold" onClick={() => onLoad(version)} type="button">{version.status === "DRAFT" ? "수정" : "값 불러오기"}</button>{version.status === "DRAFT" ? <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white" disabled={disabled} onClick={() => onTransition(version, "SUBMIT")} type="button">승인 요청</button> : null}{version.status === "PENDING" ? <button className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-bold text-white" disabled={disabled} onClick={() => onTransition(version, "ACTIVATE")} type="button">활성 승인</button> : null}{["DRAFT", "PENDING"].includes(version.status) ? <button className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700" disabled={disabled} onClick={() => onTransition(version, "END")} type="button">종료</button> : null}</div></div></article>)}</div> : <div className="rounded-xl border border-dashed p-8 text-center text-slate-500">아직 저장된 정책 버전이 없어. 추천값을 불러와 첫 초안을 만들어줘.</div>}</div>;
}

function todayKst() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
