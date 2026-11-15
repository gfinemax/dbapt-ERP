"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowUp, BookOpen, Calculator, CheckCheck, ChevronDown, CreditCard, FilePlus2, FileText, Landmark, Search, Settings, Star, Users, Wallet, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { loadQuickMenuPreferencesAction, saveQuickMenuPreferencesAction } from "@/app/finance/quick-menu/actions";
import { defaultQuickMenuIds, quickMenuEntries as entries, validQuickMenuIds, type QuickMenuId } from "@/features/finance/erp-quick-menu-catalog";

export const QUICK_MENU_STORAGE_KEY = "dbapt.erp.quick-menu.v1";
const changedEvent = "erp-quick-menu-changed";
const maximumMenus = 12; // Preserve the capacity of existing account preferences.
const icons: Partial<Record<QuickMenuId, LucideIcon>> = {
  "resolution-list": FileText, vouchers: BookOpen, "expense-entry": FilePlus2,
  "approval-inbox": CheckCheck, bank: Landmark, budget: Calculator,
  members: Users, cards: CreditCard, "corporate-use": CreditCard,
  payments: Wallet, refunds: Wallet, resolution: FilePlus2,
};
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
type Props = { badges?: Record<string, number>; onSelect?: (label: string) => void; placement?: "sidebar" | "top" };
export function ErpQuickMenu({ badges = {}, onSelect, placement = "sidebar" }: Props) {
  const isTop = placement === "top";
  const name = isTop ? "즐겨찾기" : "퀵메뉴";
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const [remoteIds, setRemoteIds] = useState<QuickMenuId[] | null>(null);
  const ids = remoteIds ?? readIds(raw);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [draft, setDraft] = useState<QuickMenuId[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const operation = useRef({ key: "", payload: "" });
  const editButton = useRef<HTMLButtonElement>(null);
  const editorInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    void loadQuickMenuPreferencesAction().then((preference) => {
      if (!active) return;
      setAuthenticated(preference.authenticated);
      setRevision(preference.revision);
      setRemoteIds(preference.authenticated ? preference.menuIds ?? defaultQuickMenuIds : null);
      setLoadFailed(false);
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setLoadFailed(true);
      setLoading(false);
    });
    return () => { active = false; };
  }, [reload]);
  useEffect(() => {
    if (editing && isTop) editorInput.current?.focus();
  }, [editing, isTop]);
  function closeEditor() {
    setEditing(false);
    editButton.current?.focus();
  }
  function openEditor() {
    setExpanded(true);
    setDraft([...ids]);
    setQuery("");
    setError("");
    setNotice("");
    setEditing(true);
    operation.current = { key: "", payload: "" };
  }
  async function save() {
    if (loading || loadFailed || saving || draft.length < 1 || draft.length > maximumMenus) return;
    setSaving(true);
    setError("");
    try {
      if (authenticated) {
        const payload = JSON.stringify([draft, revision]);
        if (operation.current.payload !== payload) operation.current = {
          key: globalThis.crypto?.randomUUID?.() ?? Date.now() + "-" + Math.random(), payload,
        };
        const saved = await saveQuickMenuPreferencesAction(draft, revision, operation.current.key);
        setRevision(saved.revision);
        setRemoteIds(saved.menuIds);
      } else {
        try {
          window.localStorage.setItem(QUICK_MENU_STORAGE_KEY, JSON.stringify(draft));
          window.dispatchEvent(new Event(changedEvent));
        } catch { throw new Error("브라우저에서 설정을 저장할 수 없어. 저장 권한을 확인해줘."); }
      }
      closeEditor();
      setNotice("즐겨찾기를 저장했습니다.");
      operation.current = { key: "", payload: "" };
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "설정을 저장하지 못했습니다. 다시 시도해주세요.");
    } finally { setSaving(false); }
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
  const buttonClass = "inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-[var(--color-soft-border)] bg-white px-2 text-xs font-semibold hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40";
  const editor = <div id="erp-quick-menu-editor" role="region" aria-label={name + " 편집"} className="max-h-[60vh] overflow-y-auto rounded-xl border border-[var(--color-soft-border)] bg-white p-4 text-sm shadow-sm" onKeyDown={(event) => { if (event.key === "Escape" && !saving) { event.stopPropagation(); closeEditor(); } }}>
    <div className="mb-3 flex items-start justify-between gap-3">
      <div><h2 className="font-bold">{name} 편집</h2><p className="mt-1 text-xs text-[var(--color-stone)]">자주 쓰는 메뉴를 추가하고 화살표로 순서를 바꾸세요. {draft.length}/{maximumMenus}개</p></div>
      <button aria-label={name + " 편집 닫기"} className={buttonClass} disabled={saving} onClick={closeEditor} type="button"><X aria-hidden="true" className="size-4" /></button>
    </div>
    <p className="mb-3 text-xs text-[var(--color-stone)]">{authenticated ? "내 계정의 모든 기기에 같은 메뉴와 순서가 표시돼." : "로그인 전에는 이 브라우저에 메뉴와 순서를 저장해."}</p>
    <fieldset disabled={saving} className="min-w-0 space-y-3">
      <legend className="sr-only">메뉴 선택과 순서</legend>
      <ol className={isTop ? "grid gap-2 md:grid-cols-2 xl:grid-cols-3" : "space-y-2"}>{draft.map((id, index) => {
        const entry = entries.find((item) => item.id === id)!;
        const Icon = icons[id] ?? FileText;
        return <li key={id} className="flex items-center gap-1 rounded-lg border border-[var(--color-soft-border)] p-2">
          <Icon aria-hidden="true" className="mr-1 size-4 shrink-0 text-[var(--color-deep-cobalt)]" /><span className="min-w-0 flex-1 font-semibold">{entry.label}</span>
          <button type="button" aria-label={entry.label + " 위로"} disabled={index === 0} onClick={() => move(id, -1)} className={buttonClass}><ArrowUp aria-hidden="true" className="size-3.5" /></button>
          <button type="button" aria-label={entry.label + " 아래로"} disabled={index === draft.length - 1} onClick={() => move(id, 1)} className={buttonClass}><ArrowDown aria-hidden="true" className="size-3.5" /></button>
          <button type="button" aria-label={entry.label + " 제거"} onClick={() => setDraft((current) => current.filter((value) => value !== id))} className={buttonClass}><X aria-hidden="true" className="size-3.5" /></button>
        </li>;
      })}</ol>
      {draft.length === 0 ? <p>메뉴를 한 개 이상 추가해주세요.</p> : null}
      {isTop ? <label className="flex max-w-md items-center gap-2 rounded-lg border border-[var(--color-soft-border)] px-3"><Search aria-hidden="true" className="size-4" /><input ref={editorInput} aria-label="즐겨찾기 메뉴 검색" placeholder="추가할 메뉴 검색" value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-10 min-w-0 flex-1 bg-transparent outline-none focus-visible:ring-2" /></label> : null}
      <label className="block text-xs font-semibold">메뉴 추가<select aria-label={name + " 추가"} value="" disabled={draft.length >= maximumMenus} className="mt-1 min-h-10 w-full max-w-md rounded-lg border border-[var(--color-soft-border)] bg-white p-2" onChange={(event) => { const id = event.target.value as QuickMenuId; if (id) setDraft((current) => current.includes(id) || current.length >= maximumMenus ? current : [...current, id]); }}><option value="">{draft.length >= maximumMenus ? "추가하려면 기존 메뉴를 제거해주세요" : "메뉴를 선택해주세요"}</option>{entries.filter((entry) => !draft.includes(entry.id) && entry.label.includes(query.trim()) && ("href" in entry || onSelect)).map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={loading || loadFailed || draft.length === 0 || draft.length > maximumMenus} onClick={() => void save()} className="min-h-10 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-40">{saving ? "저장 중" : "저장"}</button><button type="button" className={buttonClass} onClick={closeEditor}>취소</button><button type="button" className={buttonClass} onClick={() => setDraft([...defaultQuickMenuIds])}>기본값</button></div>
    </fieldset>
    {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
  </div>;
  const shortcuts = ids.map((id, index) => {
    const entry = entries.find((item) => item.id === id)!;
    const Icon = icons[id] ?? FileText;
    const count = "badgeLabel" in entry ? badges[entry.badgeLabel] ?? 0 : 0;
    const className = isTop
      ? "min-h-10 shrink-0 items-center gap-2 rounded-lg border border-[var(--color-soft-border)] bg-white px-3 text-xs font-semibold text-[var(--color-stone)] hover:border-[var(--color-deep-cobalt)] hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 " + (index >= 4 && !showAll ? "hidden md:inline-flex" : "inline-flex")
      : "flex min-h-9 items-center rounded-md border border-[var(--color-soft-border)] bg-white px-2 text-left text-[11px] font-semibold text-[var(--color-stone)] hover:border-[var(--color-deep-cobalt)] focus-visible:outline-2 disabled:opacity-40";
    const content = <>{isTop ? <Icon aria-hidden="true" className="size-4 shrink-0 text-[var(--color-deep-cobalt)]" /> : null}<span className="min-w-0 flex-1 whitespace-nowrap">{entry.label}</span>{count > 0 ? <span aria-label={entry.label + " 대기 " + count + "건"} className="ml-1 min-w-5 rounded-full bg-amber-100 px-1.5 py-0.5 text-center text-[10px] font-bold text-amber-900">{count}</span> : null}</>;
    return "href" in entry ? <a aria-label={name + " " + entry.label} className={className} href={entry.href} key={id}>{content}</a> : <button aria-label={name + " " + entry.label} title={onSelect ? undefined : "이 화면에서는 지원하지 않는 바로가기입니다"} disabled={!onSelect} className={className} key={id} type="button" onClick={() => onSelect?.(entry.label)}>{content}</button>;
  });
  return <section aria-label={name} className={isTop ? "border-t border-[var(--color-soft-border)] px-4 py-2 sm:px-6 lg:px-8" : "mt-6 border-t border-[var(--color-soft-border)] pt-4"}>
    <div className={isTop ? "flex items-center gap-2" : "mb-2 flex items-center justify-between px-2"}>
      {isTop ? <><Star aria-hidden="true" className="hidden size-4 shrink-0 text-amber-500 sm:block" /><span className="sr-only">내 즐겨찾기</span><nav aria-label="즐겨찾기 바로가기" className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1">{shortcuts}</nav>{ids.length > 4 ? <button aria-label={showAll ? "즐겨찾기 접기" : "즐겨찾기 더보기"} aria-expanded={showAll} type="button" onClick={() => setShowAll(!showAll)} className={buttonClass + " shrink-0 md:hidden"}>더보기<ChevronDown aria-hidden="true" className="size-3" /></button> : null}</> : <button aria-expanded={expanded} aria-label={"퀵메뉴 " + (expanded ? "접기" : "펼치기")} className="flex min-h-10 flex-1 items-center gap-2 rounded px-1 text-left text-xs font-bold text-[var(--color-stone)] hover:bg-white focus-visible:outline-2" onClick={() => { if (expanded) setEditing(false); setExpanded(!expanded); }} type="button"><ChevronDown aria-hidden="true" className="size-4" />퀵메뉴</button>}
      <button ref={editButton} aria-label={isTop ? "즐겨찾기 편집" : "퀵메뉴 설정"} aria-expanded={editing} aria-controls="erp-quick-menu-editor" disabled={saving || loading} type="button" className={buttonClass + " shrink-0"} onClick={() => editing ? closeEditor() : openEditor()}><Settings aria-hidden="true" className="size-4" />{isTop ? "편집" : null}</button>
    </div>
    {loading ? <p role="status" className="sr-only">설정을 불러오는 중입니다.</p> : null}
    {loadFailed ? <div role="alert" className="my-2 text-xs text-red-700">계정 설정을 불러오지 못했습니다. 다시 불러온 뒤 저장해주세요. <button type="button" className="underline" onClick={() => { setLoading(true); setLoadFailed(false); setReload((value) => value + 1); }}>다시 불러오기</button></div> : null}
    {editing && (isTop || expanded) ? <div className="mt-2">{editor}</div> : !isTop && expanded ? <div className="grid grid-cols-2 gap-1.5">{shortcuts}</div> : null}
    {notice ? <p role="status" className="sr-only">{notice}</p> : null}
  </section>;
}
