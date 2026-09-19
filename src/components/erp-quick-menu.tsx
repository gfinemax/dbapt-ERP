"use client";

import { useState, useSyncExternalStore } from "react";
import { Settings } from "lucide-react";
import { quickExpenseEntryHref } from "@/features/finance/quick-expense-entry";

const entries = [
  { id: "members", label: "조합원 등록", href: "/members" },
  { id: "collections", label: "분담금 수납처리", href: "/finance/collections" },
  { id: "bank", label: "은행거래 업로드", href: "/finance/bank-transactions" },
  { id: "cards", label: "카드내역", href: "/finance/quick-expenses?method=corporate-card" },
  { id: "resolution", label: "지출결의 작성", href: "/finance/expense-resolutions?start=advance" },
  { id: "payments", label: "지급대기", href: "/finance/payments?tab=UNPAID" },
  { id: "evidence", label: "증빙 미첨부", href: "/finance/evidence" },
  { id: "arrears", label: "미납 조합원" },
  { id: "advance", label: "받은 선지급금 정산", href: "/finance/advance-settlements" },
  { id: "expenses", label: "전체 지출", href: "/finance/expenses" },
  { id: "corporate-use", label: "법인카드 사용 등록", href: quickExpenseEntryHref("CORPORATE_CARD") },
  { id: "expense-entry", label: "지출 등록·신청", href: "/finance/expense-entry" },
  { id: "personal-refund", label: "개인 선지출 환급", href: "/finance/reimbursements" },
  { id: "trust-operating", label: "월 운영비 요청", href: "/finance/trust?view=operating-funds" },
  { id: "trust-business", label: "사업비 신탁 요청", href: "/finance/trust?view=business" },
] as const;
const defaults = entries.slice(0, 8).map((entry) => entry.id);
export const QUICK_MENU_STORAGE_KEY = "dbapt.erp.quick-menu.v1";
const changedEvent = "erp-quick-menu-changed";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(changedEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(changedEvent, callback);
  };
}
function snapshot() {
  try { return window.localStorage.getItem(QUICK_MENU_STORAGE_KEY); } catch { return null; }
}
function readIds(raw: string | null): string[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return [...new Set(parsed.filter((id): id is string => typeof id === "string" && entries.some((entry) => entry.id === id)))];
  } catch { /* Invalid preferences do not prevent navigation. */ }
  return defaults;
}

export function ErpQuickMenu({ onSelect }: { onSelect?: (label: string) => void }) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const ids = readIds(raw);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [error, setError] = useState("");
  function save() {
    try {
      window.localStorage.setItem(QUICK_MENU_STORAGE_KEY, JSON.stringify(draft));
      window.dispatchEvent(new Event(changedEvent));
      setEditing(false);
      setError("");
    } catch { setError("브라우저에서 설정을 저장할 수 없어. 저장 권한을 확인해줘."); }
  }
  function move(id: string, offset: number) {
    setDraft((current) => {
      const next = [...current];
      const index = next.indexOf(id);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  return <section aria-label="퀵메뉴" className="mt-6 border-t border-[var(--color-soft-border)] pt-4">
    <div className="mb-2 flex items-center justify-between px-2">
      <p className="text-xs font-bold text-[var(--color-stone)]">퀵메뉴</p>
      <button aria-label="퀵메뉴 설정" aria-expanded={editing} type="button" className="rounded p-2 hover:bg-white focus-visible:outline-2" onClick={() => { setDraft(ids); setError(""); setEditing(!editing); }}><Settings aria-hidden="true" className="size-4" /></button>
    </div>
    {editing ? <div aria-label="퀵메뉴 편집" className="space-y-2 text-xs">
      <p>이 브라우저에 표시할 메뉴와 순서를 설정해.</p>
      <ol className="space-y-1">{draft.map((id, index) => {
        const entry = entries.find((item) => item.id === id)!;
        return <li key={id} className="flex items-center gap-1 rounded border border-[var(--color-soft-border)] p-1">
          <span className="min-w-0 flex-1">{entry.label}</span>
          <button type="button" aria-label={`${entry.label} 위로`} disabled={index === 0} onClick={() => move(id, -1)} className="p-1 disabled:opacity-30">↑</button>
          <button type="button" aria-label={`${entry.label} 아래로`} disabled={index === draft.length - 1} onClick={() => move(id, 1)} className="p-1 disabled:opacity-30">↓</button>
          <button type="button" aria-label={`${entry.label} 제거`} onClick={() => setDraft((current) => current.filter((value) => value !== id))} className="p-1">×</button>
        </li>;
      })}</ol>
      <label className="block">메뉴 추가<select aria-label="퀵메뉴 추가" value="" className="mt-1 w-full rounded border bg-white p-2" onChange={(event) => { const id = event.target.value; if (id) setDraft((current) => [...current, id]); }}><option value="">선택해줘</option>{entries.filter((entry) => !draft.includes(entry.id)).map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
      <div className="flex gap-2"><button type="button" onClick={save} className="rounded bg-slate-900 px-3 py-2 text-white">저장</button><button type="button" onClick={() => setEditing(false)}>취소</button><button type="button" onClick={() => setDraft(defaults)}>기본값</button></div>
      {error ? <p role="alert">{error}</p> : null}
    </div> : <div className="grid grid-cols-2 gap-1.5">{ids.map((id) => {
      const entry = entries.find((item) => item.id === id)!;
      const className = "flex min-h-9 items-center rounded-md border border-[var(--color-soft-border)] bg-white px-2 text-left text-[11px] font-semibold text-[var(--color-stone)] hover:border-[var(--color-deep-cobalt)] focus-visible:outline-2 disabled:opacity-40";
      return "href" in entry ? <a aria-label={`퀵메뉴 ${entry.label}`} className={className} href={entry.href} key={id}>{entry.label}</a> : <button aria-label={`퀵메뉴 ${entry.label}`} title={onSelect ? undefined : "이 화면에서는 지원하지 않는 바로가기야"} disabled={!onSelect} className={className} key={id} type="button" onClick={() => onSelect?.(entry.label)}>{entry.label}</button>;
    })}</div>}
  </section>;
}
