"use client";

import { useState } from "react";
import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import { defaultExpenseComplianceSettings, type ExpenseComplianceSettings } from "./expense-compliance";

export function ExpenseComplianceSettingsPage({ initialSettings = defaultExpenseComplianceSettings, organizationId, saveSettings }: { initialSettings?: ExpenseComplianceSettings; organizationId?: string; saveSettings?: (organizationId: string, settings: ExpenseComplianceSettings) => Promise<void> }) {
  const [settings, setSettings] = useState(initialSettings);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function save() {
    if (!organizationId || !saveSettings) { setError("조합 또는 설정 저장소가 연결되지 않았습니다."); return; }
    try { setError(""); await saveSettings(organizationId, settings); setMessage("지출 관리설정을 저장했습니다."); } catch (caught) { setError(caught instanceof Error ? caught.message : "설정을 저장하지 못했습니다."); }
  }
  return <ErpShell activeDetailLabel="지출 관리설정" activeWorkspaceLabel="전표·증빙관리">
    <main className="mx-auto max-w-5xl p-6">
      <p className="text-sm font-bold text-[var(--color-stone)]">회계/자금 &gt; 전표·증빙관리 &gt; 지출 관리설정</p>
      <h1 className="mt-2 text-3xl font-bold">지출결의 관리설정</h1>
      <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4 font-bold text-amber-900">소액경비 기준은 지출결의서 작성 면제 기준이 아니라 월별 일괄결의가 가능한 내부 관리기준입니다.</p>
      <section className="mt-6 grid gap-5 rounded-2xl border border-[var(--color-soft-border)] bg-white p-6 md:grid-cols-2">
        <SettingNumber label="소액경비 기준금액" value={settings.pettyCashLimit} onChange={(value) => setSettings((current) => ({ ...current, pettyCashLimit: value }))} />
        <SettingNumber label="지출자별 월 누계 경고금액" value={settings.monthlyPersonWarningLimit} onChange={(value) => setSettings((current) => ({ ...current, monthlyPersonWarningLimit: value }))} />
        <SettingList label="소액경비 일괄결의 허용 계정과목" value={settings.pettyCashAllowedAccounts} onChange={(value) => setSettings((current) => ({ ...current, pettyCashAllowedAccounts: value }))} />
        <SettingList label="소액경비 일괄결의 제외 항목" value={settings.pettyCashExcludedKeywords} onChange={(value) => setSettings((current) => ({ ...current, pettyCashExcludedKeywords: value }))} />
        <label className="flex items-center gap-3 rounded-xl border p-4 font-bold md:col-span-2"><input checked={settings.allowNoEvidenceApproval} onChange={(event) => setSettings((current) => ({ ...current, allowNoEvidenceApproval: event.target.checked }))} type="checkbox" />증빙 없는 지출 승인 허용</label>
        <SettingNumber label="사후결의 허용기간(일)" value={settings.postApprovalMaxDays ?? 0} onChange={(value) => setSettings((current) => ({ ...current, postApprovalMaxDays: value }))} />
        <label className="grid gap-2 font-bold"><span>증빙 없는 지출 승인권자</span><input className="h-11 rounded-lg border px-3" onChange={(event) => setSettings((current) => ({ ...current, noEvidenceApproverRole: event.target.value }))} value={settings.noEvidenceApproverRole ?? ""} /></label>
        <SettingList label="지출사실 확인자 권한" value={settings.factConfirmerRoles ?? []} onChange={(value) => setSettings((current) => ({ ...current, factConfirmerRoles: value }))} />
        <SettingList label="결재선" value={settings.approvalLine ?? []} onChange={(value) => setSettings((current) => ({ ...current, approvalLine: value }))} />
        <label className="flex items-center gap-3 rounded-xl border p-4 font-bold"><input checked={settings.allowPersonalReimbursement ?? true} onChange={(event) => setSettings((current) => ({ ...current, allowPersonalReimbursement: event.target.checked }))} type="checkbox" />개인 선지출 허용</label>
        <div className="flex items-center justify-between md:col-span-2"><div>{message ? <p className="font-bold text-green-700">{message}</p> : null}{error ? <p className="font-bold text-red-700">{error}</p> : null}</div><Button onClick={() => void save()}>설정 저장</Button></div>
      </section>
    </main>
  </ErpShell>;
}

function SettingNumber({ label, onChange, value }: { label: string; onChange: (value: number) => void; value: number }) { return <label className="grid gap-2 font-bold"><span>{label}</span><input aria-label={label} className="h-11 rounded-lg border px-3" min="0" onChange={(event) => onChange(Number(event.target.value))} type="number" value={value} /><span className="text-xs text-[var(--color-stone)]">{value.toLocaleString("ko-KR")}원</span></label>; }
function SettingList({ label, onChange, value }: { label: string; onChange: (value: string[]) => void; value: string[] }) { return <label className="grid gap-2 font-bold"><span>{label}</span><textarea className="min-h-48 rounded-lg border p-3 text-sm font-medium" onChange={(event) => onChange(event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))} value={value.join("\n")} /><span className="text-xs text-[var(--color-stone)]">한 줄에 하나씩 입력</span></label>; }
