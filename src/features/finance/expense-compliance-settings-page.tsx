"use client";

import { useState } from "react";
import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import { ExpensePolicySettingsPanel } from "./expense-policy-settings-panel";
import type { ExpensePolicyImpactPreview, ExpensePolicyValues, ExpensePolicyWorkspace } from "./expense-policy-settings";
import {
  defaultExpenseComplianceSettings,
  type ExpenseComplianceSettings,
} from "./expense-compliance";

export function ExpenseComplianceSettingsPage({
  initialSettings = defaultExpenseComplianceSettings,
  organizationId,
  saveSettings,
  policyWorkspace = { preview: { delayedReimbursements: 0, longDelayedReimbursements: 0, pendingExpenseResolutions: 0, pendingQuickExpenses: 0, pendingReimbursements: 0, priorYearReimbursements: 0 }, versions: [] },
  savePolicyDraft,
  previewPolicy,
  transitionPolicy,
}: {
  initialSettings?: ExpenseComplianceSettings;
  organizationId?: string;
  saveSettings?: (
    organizationId: string,
    settings: ExpenseComplianceSettings,
  ) => Promise<void>;
  policyWorkspace?: ExpensePolicyWorkspace;
  savePolicyDraft?: (input: { organizationId: string; id?: string; policy: ExpensePolicyValues; effectiveFrom: string; changeReason: string }) => Promise<void>;
  previewPolicy?: (input: { organizationId: string; policy: ExpensePolicyValues }) => Promise<ExpensePolicyImpactPreview>;
  transitionPolicy?: (input: { organizationId: string; id: string; command: "SUBMIT" | "ACTIVATE" | "END" }) => Promise<void>;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function save() {
    if (!organizationId || !saveSettings) {
      setError("조합 또는 설정 저장소가 연결되지 않았습니다.");
      return;
    }
    try {
      setError("");
      await saveSettings(organizationId, settings);
      setMessage("지출 관리설정을 저장했습니다.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "설정을 저장하지 못했습니다.",
      );
    }
  }
  return (
    <ErpShell
      activeDetailLabel="지출 처리 기준"
      activeWorkspaceLabel="전표·증빙관리"
    >
      <main className="mx-auto max-w-5xl p-6">
        <p className="text-sm font-bold text-[var(--color-stone)]">
          회계/자금 &gt; 전표·증빙관리 &gt; 지출 관리설정
        </p>
        <h1 className="mt-2 text-3xl font-bold">지출결의 관리설정</h1>
        <p className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-4 font-bold text-blue-950">
          신규 소액지출은 지출관리의 소액지출 화면에서 등록하고, 한도는
          기초정보의 결재 설정에서 관리해. 기존 소액 일괄결의 기준값은 과거 문서
          검증을 위해 데이터에만 보존돼.
        </p>
        <ExpensePolicySettingsPanel organizationId={organizationId} previewPolicy={previewPolicy} saveDraft={savePolicyDraft} transitionPolicy={transitionPolicy} workspace={policyWorkspace} />
        <section className="mt-6 grid gap-5 rounded-2xl border border-[var(--color-soft-border)] bg-white p-6 md:grid-cols-2">
          <div className="md:col-span-2"><h2 className="text-xl font-bold">기존 지출결의 옵션</h2><p className="mt-1 text-sm text-slate-600">현재 지출결의 작성과 증빙 검증에 바로 사용하는 세부 옵션이야.</p></div>
          <label className="flex items-center gap-3 rounded-xl border p-4 font-bold md:col-span-2">
            <input
              checked={settings.allowDirectExpense ?? true}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  allowDirectExpense: event.target.checked,
                }))
              }
              type="checkbox"
            />
            기안 없는 직접 지출결의 허용
          </label>
          <SettingNumber
            label="직접 지출 가능 한도"
            value={settings.directExpenseLimit ?? 5_000_000}
            onChange={(value) =>
              setSettings((current) => ({
                ...current,
                directExpenseLimit: value,
              }))
            }
          />
          <SettingList
            label="기안 필수 업무 키워드"
            value={settings.directExpenseRequiredKeywords ?? []}
            onChange={(value) =>
              setSettings((current) => ({
                ...current,
                directExpenseRequiredKeywords: value,
              }))
            }
          />
          <SettingList
            label="기안 연결 권장 업무 키워드"
            value={settings.directExpenseRecommendedKeywords ?? []}
            onChange={(value) =>
              setSettings((current) => ({
                ...current,
                directExpenseRecommendedKeywords: value,
              }))
            }
          />
          <SettingList
            label="예산 내 간편지출 허용 예산항목"
            value={settings.quickExpenseAllowedBudgetItems ?? []}
            onChange={(value) =>
              setSettings((current) => ({
                ...current,
                quickExpenseAllowedBudgetItems: value,
              }))
            }
          />
          <label className="flex items-center gap-3 rounded-xl border p-4 font-bold">
            <input
              checked={settings.allowOtherApprovalSkipReason ?? true}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  allowOtherApprovalSkipReason: event.target.checked,
                }))
              }
              type="checkbox"
            />
            기타 기안 생략 사유 직접 입력 허용
          </label>
          <label className="flex items-center gap-3 rounded-xl border p-4 font-bold md:col-span-2">
            <input
              checked={settings.allowNoEvidenceApproval}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  allowNoEvidenceApproval: event.target.checked,
                }))
              }
              type="checkbox"
            />
            증빙 없는 지출 승인 허용
          </label>
          <SettingNumber
            label="사후결의 허용기간(일)"
            value={settings.postApprovalMaxDays ?? 0}
            onChange={(value) =>
              setSettings((current) => ({
                ...current,
                postApprovalMaxDays: value,
              }))
            }
          />
          <label className="grid gap-2 font-bold">
            <span>증빙 없는 지출 승인권자</span>
            <input
              className="h-11 rounded-lg border px-3"
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  noEvidenceApproverRole: event.target.value,
                }))
              }
              value={settings.noEvidenceApproverRole ?? ""}
            />
          </label>
          <SettingList
            label="지출사실 확인자 권한"
            value={settings.factConfirmerRoles ?? []}
            onChange={(value) =>
              setSettings((current) => ({
                ...current,
                factConfirmerRoles: value,
              }))
            }
          />
          <SettingList
            label="결재선"
            value={settings.approvalLine ?? []}
            onChange={(value) =>
              setSettings((current) => ({ ...current, approvalLine: value }))
            }
          />
          <label className="flex items-center gap-3 rounded-xl border p-4 font-bold">
            <input
              checked={settings.allowPersonalReimbursement ?? true}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  allowPersonalReimbursement: event.target.checked,
                }))
              }
              type="checkbox"
            />
            개인 선지출 허용
          </label>
          <div className="flex items-center justify-between md:col-span-2">
            <div>
              {message ? (
                <p className="font-bold text-green-700">{message}</p>
              ) : null}
              {error ? <p className="font-bold text-red-700">{error}</p> : null}
            </div>
            <Button onClick={() => void save()}>설정 저장</Button>
          </div>
        </section>
      </main>
    </ErpShell>
  );
}

function SettingNumber({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="grid gap-2 font-bold">
      <span>{label}</span>
      <input
        aria-label={label}
        className="h-11 rounded-lg border px-3"
        min="0"
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        value={value}
      />
      <span className="text-xs text-[var(--color-stone)]">
        {value.toLocaleString("ko-KR")}원
      </span>
    </label>
  );
}
function SettingList({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string[]) => void;
  value: string[];
}) {
  return (
    <label className="grid gap-2 font-bold">
      <span>{label}</span>
      <textarea
        className="min-h-48 rounded-lg border p-3 text-sm font-medium"
        onChange={(event) =>
          onChange(
            event.target.value
              .split(/\r?\n/)
              .map((item) => item.trim())
              .filter(Boolean),
          )
        }
        value={value.join("\n")}
      />
      <span className="text-xs text-[var(--color-stone)]">
        한 줄에 하나씩 입력
      </span>
    </label>
  );
}
