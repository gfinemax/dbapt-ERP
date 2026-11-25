"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type { ExpenseCorrectionInput, ExpenseCorrectionOptions } from "./expense-resolution-correction";
import { getResolutionAccountTitle } from "./expense-resolution-display";
import type { ManagedExpenseResolution } from "./expense-resolution-page";

const fieldClass = "w-full rounded-lg border border-[var(--color-soft-border)] bg-white px-3 py-2 font-normal";
const fields = [
  { name: "subject", label: "건명", maxLength: 60 },
  { name: "reason", label: "업무목적", maxLength: 4000 },
  { name: "memo", label: "내부메모", maxLength: 4000 },
] as const;

export function ExpenseResolutionCorrectionForm({ resolution, loadOptions, onSave, onClose }: {
  resolution: ManagedExpenseResolution;
  loadOptions?: (id: string) => Promise<ExpenseCorrectionOptions>;
  onSave: (input: ExpenseCorrectionInput) => Promise<void>;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<ExpenseCorrectionOptions>();
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState("");
  const [preview, setPreview] = useState<{ input: ExpenseCorrectionInput; changes: { label: string; before: string; after: string }[] }>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  async function loadAccounts() {
    if (!loadOptions || optionsLoading) return;
    setOptionsLoading(true);
    setOptionsError("");
    try {
      setOptions(await loadOptions(resolution.id));
    } catch (cause) {
      setOptionsError(cause instanceof Error ? cause.message : "계정과목을 불러오지 못했어.");
    } finally {
      setOptionsLoading(false);
    }
  }

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input: ExpenseCorrectionInput = {
      id: resolution.id, revision: resolution.correctionRevision ?? 0,
      key: crypto.randomUUID(), reason: String(form.get("correctionReason") ?? "").trim(), patch: {},
    };
    const changes: NonNullable<ManagedExpenseResolution["history"][number]["changes"]> = [];
    for (const field of fields) {
      const after = String(form.get(field.name) ?? "").trim();
      const before = resolution[field.name] ?? "";
      if (after === before.trim()) continue;
      input.patch[field.name] = after;
      changes.push({ label: field.label, before, after });
    }
    if (resolution.resolutionType === "BATCH") {
      const purposes: Record<string, string> = {};
      for (const item of resolution.expenseItems) {
        const before = item.businessPurpose || resolution.reason || "";
        const after = String(form.get(`item:${item.id}`) ?? "").trim();
        if (after === before.trim()) continue;
        if (!after) { setError(`${item.itemNo}행 업무목적을 입력해줘.`); return; }
        purposes[item.id] = after;
        changes.push({ label: `${item.itemNo}행 업무목적`, before, after });
      }
      if (Object.keys(purposes).length) input.patch.itemPurposes = purposes;
    }
    const option = options?.options[Number(form.get("classification")) - 1];
    if (option) {
      input.patch.classification = { accountId: option.accountId, budgetId: option.budgetId, detailId: option.detailId };
      changes.push({
        label: "계정과목 · 예산 · 세부항목",
        before: [getResolutionAccountTitle(resolution), resolution.budgetItem, resolution.operationExpenseDetail].filter(Boolean).join(" · "),
        after: [option.accountName, option.budgetName, option.detailName].join(" · "),
      });
    }
    if (!changes.length) { setError("변경된 항목이 없어."); return; }
    if (input.reason.length < 2) { setError("정정 사유를 두 글자 이상 입력해줘."); return; }
    if (input.patch.subject === "" || input.patch.reason === "") { setError("건명과 업무목적은 비울 수 없어."); return; }
    setError("");
    setPreview({ input, changes });
  }

  async function save() {
    if (!preview || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave(preview.input);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "정정 내용을 저장하지 못했어.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="expense-correction-title" className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--color-cloud-veil)] p-5">
      <h3 className="text-lg font-black" id="expense-correction-title">승인완료 문서 정정</h3>
      <form className={preview ? "hidden" : "mt-4 grid gap-4"} onSubmit={review}>
        {fields.map(({ name, label, maxLength }) => (
          <label className="grid gap-1 text-sm font-bold" key={name}>
            {label}
            {name === "subject"
              ? <input className={fieldClass} defaultValue={resolution[name] ?? ""} maxLength={maxLength} name={name} />
              : <textarea className={fieldClass} defaultValue={resolution[name] ?? ""} maxLength={maxLength} name={name} rows={3} />}
          </label>
        ))}
        {resolution.resolutionType === "BATCH" && resolution.expenseItems.length ? (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-bold">항목별 업무목적</summary>
            <div className="mt-3 grid gap-3">
              {resolution.expenseItems.map((item) => (
                <label className="grid gap-1 text-sm font-bold" key={item.id}>
                  {item.itemNo}행 · {item.itemTitle}
                  <textarea className={fieldClass} defaultValue={item.businessPurpose || resolution.reason || ""} maxLength={4000} name={`item:${item.id}`} rows={2} />
                </label>
              ))}
            </div>
          </details>
        ) : null}
        {loadOptions ? (
          <div className="grid gap-2 text-sm">
            {options?.options.length ? (
              <label className="grid gap-1 font-bold">
                계정과목 · 예산 · 세부항목
                <select className={fieldClass} defaultValue="" name="classification">
                  <option value="">기존 분류 유지</option>
                  {options.options.map((option, index) => (
                    <option key={`${option.accountId}:${option.detailId}`} value={index + 1}>
                      {option.accountName} · {option.budgetName} · {option.detailName}
                    </option>
                  ))}
                </select>
              </label>
            ) : options ? <p role="status">{options.blockedReason ?? "이 귀속연도에 선택할 수 있는 확정 계정·예산 연결이 없어."}</p>
              : <Button className="justify-self-start" disabled={optionsLoading} onClick={() => { void loadAccounts(); }} type="button" variant="outline">{optionsLoading ? "불러오는 중" : "계정과목 정정"}</Button>}
            {optionsError ? <p className="text-red-700" role="alert">{optionsError}</p> : null}
          </div>
        ) : null}
        <label className="grid gap-1 text-sm font-bold">
          정정 사유
          <textarea className={fieldClass} maxLength={500} minLength={2} name="correctionReason" required rows={2} />
        </label>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} type="button" variant="outline">취소</Button>
          <Button type="submit">변경 내용 확인</Button>
        </div>
      </form>
      {preview ? (
        <div className="mt-4 grid gap-3">
          <ExpenseCorrectionChanges changes={preview.changes} />
          <p className="whitespace-pre-wrap text-sm"><strong>정정 사유</strong> {preview.input.reason}</p>
          <div className="flex justify-end gap-2">
            <Button disabled={saving} onClick={() => { setPreview(undefined); setError(""); }} type="button" variant="outline">다시 수정</Button>
            <Button disabled={saving} onClick={() => { void save(); }} type="button">{saving ? "저장 중" : "정정 저장"}</Button>
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm font-semibold text-red-700" role="alert">{error}</p> : null}
    </section>
  );
}

export function ExpenseCorrectionChanges({ changes }: { changes: NonNullable<ManagedExpenseResolution["history"][number]["changes"]> }) {
  return (
    <dl className="grid gap-2 text-sm">
      {changes.map(({ label, before, after }, index) => (
        <div className="rounded-lg border bg-white p-3" key={`${label}:${index}`}>
          <dt className="font-bold">{label}</dt>
          <dd className="mt-1 grid gap-2 sm:grid-cols-2">
            <p className="whitespace-pre-wrap break-words"><strong>변경 전</strong> {before || "미입력"}</p>
            <p className="whitespace-pre-wrap break-words"><strong>변경 후</strong> {after || "미입력"}</p>
          </dd>
        </div>
      ))}
    </dl>
  );
}
