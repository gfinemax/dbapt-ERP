"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, Settings, Star } from "lucide-react";
import { loadQuickMenuPreferencesAction, saveQuickMenuPreferencesAction } from "@/app/finance/quick-menu/actions";
import { defaultQuickMenuIds, quickMenuEntries as entries, validQuickMenuIds, type QuickMenuId } from "@/features/finance/erp-quick-menu-catalog";
import { buttonClass, menuIcon } from "./erp-quick-menu-ui";

const QuickMenuEditor = dynamic(() => import("./erp-quick-menu-editor"), {
  loading: () => <p role="status" className="p-4 text-sm">편집 화면을 불러오는 중입니다.</p>,
});
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
type Props = { badges?: Record<string, number> };
export function ErpQuickMenu({ badges = {} }: Props) {
  const name = "즐겨찾기";
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const [remoteIds, setRemoteIds] = useState<QuickMenuId[] | null>(null);
  const ids = remoteIds ?? readIds(raw);
  const [editing, setEditing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [notice, setNotice] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [revision, setRevision] = useState(0);
  const editButton = useRef<HTMLButtonElement>(null);
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
  function closeEditor() {
    setEditing(false);
    editButton.current?.focus();
  }
  async function save(draft: QuickMenuId[], operationKey: string) {
    if (loading || loadFailed) throw new Error("계정 설정을 먼저 불러와주세요.");
    if (authenticated) {
      const saved = await saveQuickMenuPreferencesAction(draft, revision, operationKey);
      setRevision(saved.revision);
      setRemoteIds(saved.menuIds);
    } else {
      try {
        window.localStorage.setItem(QUICK_MENU_STORAGE_KEY, JSON.stringify(draft));
        window.dispatchEvent(new Event(changedEvent));
      } catch { throw new Error("브라우저에서 설정을 저장할 수 없어. 저장 권한을 확인해줘."); }
    }
    setNotice("즐겨찾기를 저장했습니다.");
  }
  const shortcuts = ids.map((id, index) => {
    const entry = entries.find((item) => item.id === id)!;
    const Icon = menuIcon(id);
    const count = "badgeLabel" in entry ? badges[entry.badgeLabel] ?? 0 : 0;
    const className = "min-h-10 shrink-0 items-center gap-2 rounded-lg border border-[var(--color-soft-border)] bg-white px-3 text-xs font-semibold text-[var(--color-stone)] hover:border-[var(--color-deep-cobalt)] hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 " + (index >= 4 && !showAll ? "hidden md:inline-flex" : "inline-flex");
    const content = <><Icon aria-hidden="true" className="size-4 shrink-0 text-[var(--color-deep-cobalt)]" /><span className="min-w-0 flex-1 whitespace-nowrap">{entry.label}</span>{count > 0 ? <span aria-label={entry.label + " 대기 " + count + "건"} className="ml-1 min-w-5 rounded-full bg-amber-100 px-1.5 py-0.5 text-center text-[10px] font-bold text-amber-900">{count}</span> : null}</>;
    return "href" in entry ? <a aria-label={name + " " + entry.label} className={className} href={entry.href} key={id}>{content}</a> : <button aria-label={name + " " + entry.label} title="지원하지 않는 바로가기입니다" disabled className={className} key={id} type="button">{content}</button>;
  });
  return <section aria-label={name} className="px-4 py-2 sm:px-6 lg:px-8">
    <div className="flex h-12 items-center gap-2">
      <Star aria-hidden="true" className="size-4 shrink-0 text-amber-500" /><span className="shrink-0 text-xs font-bold">즐겨찾기</span>
      <nav aria-label="즐겨찾기 바로가기" className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1">{shortcuts}</nav>
      {ids.length > 4 ? <button aria-label={showAll ? "즐겨찾기 접기" : "즐겨찾기 더보기"} aria-expanded={showAll} type="button" onClick={() => setShowAll(!showAll)} className={buttonClass + " shrink-0 md:hidden"}>더보기<ChevronDown aria-hidden="true" className="size-3" /></button> : null}
      <button ref={editButton} aria-label="즐겨찾기 편집" aria-expanded={editing} aria-controls="erp-quick-menu-editor" disabled={loading} type="button" className={buttonClass + " shrink-0"} onClick={() => { if (!editing) { setNotice(""); setEditing(true); } }}><Settings aria-hidden="true" className="size-4" />편집</button>
    </div>
    {loading ? <p role="status" className="sr-only">설정을 불러오는 중입니다.</p> : null}
    {loadFailed ? <div role="alert" className="my-2 text-xs text-red-700">계정 설정을 불러오지 못했습니다. 다시 불러온 뒤 저장해주세요. <button type="button" className="underline" onClick={() => { setLoading(true); setLoadFailed(false); setReload((value) => value + 1); }}>다시 불러오기</button></div> : null}
    {editing ? <div className="mt-2"><QuickMenuEditor ids={ids} isTop={true} authenticated={authenticated} blocked={loading || loadFailed} allowCallbacks={false} onClose={closeEditor} onSave={save} /></div> : null}
    {notice ? <p role="status" className="sr-only">{notice}</p> : null}
  </section>;
}
