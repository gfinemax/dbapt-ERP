"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Settings } from "lucide-react";
import { loadQuickMenuPreferencesAction, saveQuickMenuPreferencesAction } from "@/app/finance/quick-menu/actions";
import { defaultQuickMenuIds, quickMenuEntries as entries, validQuickMenuIds, type QuickMenuId } from "@/features/finance/erp-quick-menu-catalog";

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
function readIds(raw: string | null): QuickMenuId[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return validQuickMenuIds(parsed);
  } catch { /* Invalid preferences do not prevent navigation. */ }
  return defaultQuickMenuIds;
}

export function ErpQuickMenu({ onSelect }: { onSelect?: (label: string) => void }) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const [remoteIds, setRemoteIds] = useState<QuickMenuId[] | null>(null);
  const ids = remoteIds ?? readIds(raw);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<QuickMenuId[]>([]);
  const [error, setError] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const operationKey = useRef("");
  useEffect(() => {
    let active = true;
    void loadQuickMenuPreferencesAction().then((preference) => {
      if (!active) return;
      setAuthenticated(preference.authenticated);
      setRevision(preference.revision);
      if (!preference.menuIds) return;
      setRemoteIds(preference.menuIds);
      try {
        window.localStorage.setItem(QUICK_MENU_STORAGE_KEY, JSON.stringify(preference.menuIds));
        window.dispatchEvent(new Event(changedEvent));
      } catch { /* Account preference remains usable even when browser storage is blocked. */ }
    }).catch(() => { /* Navigation remains available with the browser preference. */ });
    return () => { active = false; };
  }, []);
  async function save() {
    setSaving(true);
    setError("");
    try {
      if (authenticated) {
        operationKey.current ||= globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
        const saved = await saveQuickMenuPreferencesAction(draft, revision, operationKey.current);
        setRevision(saved.revision);
        setRemoteIds(saved.menuIds);
      }
      try {
        window.localStorage.setItem(QUICK_MENU_STORAGE_KEY, JSON.stringify(draft));
        window.dispatchEvent(new Event(changedEvent));
      } catch { throw new Error("브라우저에서 설정을 저장할 수 없어. 저장 권한을 확인해줘."); }
      setEditing(false);
      operationKey.current = "";
    } catch (caught) { setError(caught instanceof Error ? caught.message : "퀵메뉴 설정을 저장할 수 없어. 잠시 후 다시 시도해줘."); }
    finally { setSaving(false); }
  }
  function move(id: QuickMenuId, offset: number) {
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
      <button aria-label="퀵메뉴 설정" aria-expanded={editing} type="button" className="rounded p-2 hover:bg-white focus-visible:outline-2" onClick={() => { setDraft(validQuickMenuIds(ids)); setError(""); setEditing(!editing); operationKey.current = ""; }}><Settings aria-hidden="true" className="size-4" /></button>
    </div>
    {editing ? <div aria-label="퀵메뉴 편집" className="space-y-2 text-xs">
      <p>{authenticated ? "내 계정의 모든 기기에 같은 메뉴와 순서가 표시돼." : "로그인 전에는 이 브라우저에 메뉴와 순서를 저장해."}</p>
      <ol className="space-y-1">{draft.map((id, index) => {
        const entry = entries.find((item) => item.id === id)!;
        return <li key={id} className="flex items-center gap-1 rounded border border-[var(--color-soft-border)] p-1">
          <span className="min-w-0 flex-1">{entry.label}</span>
          <button type="button" aria-label={`${entry.label} 위로`} disabled={index === 0} onClick={() => move(id, -1)} className="p-1 disabled:opacity-30">↑</button>
          <button type="button" aria-label={`${entry.label} 아래로`} disabled={index === draft.length - 1} onClick={() => move(id, 1)} className="p-1 disabled:opacity-30">↓</button>
          <button type="button" aria-label={`${entry.label} 제거`} onClick={() => setDraft((current) => current.filter((value) => value !== id))} className="p-1">×</button>
        </li>;
      })}</ol>
      <label className="block">메뉴 추가<select aria-label="퀵메뉴 추가" value="" className="mt-1 w-full rounded border bg-white p-2" onChange={(event) => { const id = event.target.value as QuickMenuId; if (id) setDraft((current) => [...current, id]); }}><option value="">선택해줘</option>{entries.filter((entry) => !draft.includes(entry.id)).map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
      <div className="flex gap-2"><button type="button" disabled={saving || draft.length === 0} onClick={() => void save()} className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-50">{saving ? "저장 중" : "저장"}</button><button type="button" disabled={saving} onClick={() => setEditing(false)}>취소</button><button type="button" disabled={saving} onClick={() => setDraft(defaultQuickMenuIds)}>기본값</button></div>
      {error ? <p role="alert">{error}</p> : null}
    </div> : <div className="grid grid-cols-2 gap-1.5">{ids.map((id) => {
      const entry = entries.find((item) => item.id === id)!;
      const className = "flex min-h-9 items-center rounded-md border border-[var(--color-soft-border)] bg-white px-2 text-left text-[11px] font-semibold text-[var(--color-stone)] hover:border-[var(--color-deep-cobalt)] focus-visible:outline-2 disabled:opacity-40";
      return "href" in entry ? <a aria-label={`퀵메뉴 ${entry.label}`} className={className} href={entry.href} key={id}>{entry.label}</a> : <button aria-label={`퀵메뉴 ${entry.label}`} title={onSelect ? undefined : "이 화면에서는 지원하지 않는 바로가기야"} disabled={!onSelect} className={className} key={id} type="button" onClick={() => onSelect?.(entry.label)}>{entry.label}</button>;
    })}</div>}
  </section>;
}
