"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import { defaultQuickMenuIds, quickMenuEntries as entries, type QuickMenuId } from "@/features/finance/erp-quick-menu-catalog";
import { buttonClass, menuIcon } from "./erp-quick-menu-ui";

type Props = {
 ids: QuickMenuId[]; isTop: boolean; authenticated: boolean; blocked: boolean; allowCallbacks: boolean;
 onClose: () => void; onSave: (ids: QuickMenuId[], operationKey: string) => Promise<void>;
};
export default function QuickMenuEditor({ ids, isTop, authenticated, blocked, allowCallbacks, onClose, onSave }: Props) {
 const name = isTop ? "즐겨찾기" : "퀵메뉴";
 const maximumMenus = 12;
 const [draft, setDraft] = useState<QuickMenuId[]>(() => [...ids]);
 const [query, setQuery] = useState("");
 const [error, setError] = useState("");
 const [saving, setSaving] = useState(false);
 const editorInput = useRef<HTMLInputElement>(null);
 const operation = useRef({ key: "", payload: "" });
 useEffect(() => { editorInput.current?.focus(); }, []);
 function closeEditor() { if (!saving) onClose(); }
 function move(id: QuickMenuId, offset: number) {
   setDraft((current) => {
     const next = [...current]; const index = next.indexOf(id); const target = index + offset;
     if (index < 0 || target < 0 || target >= next.length) return current;
     [next[index], next[target]] = [next[target], next[index]];
     return next;
   });
 }
 async function save() {
   if (blocked || saving || draft.length < 1 || draft.length > maximumMenus) return;
   setSaving(true); setError("");
   const payload = JSON.stringify(draft);
   if (operation.current.payload !== payload) operation.current = {
     key: globalThis.crypto?.randomUUID?.() ?? Date.now() + "-" + Math.random(), payload,
   };
   try { await onSave(draft, operation.current.key); onClose(); }
   catch (caught) { setError(caught instanceof Error ? caught.message : "설정을 저장하지 못했습니다. 다시 시도해주세요."); }
   finally { setSaving(false); }
 }
  return <div id="erp-quick-menu-editor" role="region" aria-label={name + " 편집"} className="max-h-[60vh] overflow-y-auto rounded-xl border border-[var(--color-soft-border)] bg-white p-4 text-sm shadow-sm" onKeyDown={(event) => { if (event.key === "Escape" && !saving) { event.stopPropagation(); closeEditor(); } }}>
    <div className="mb-3 flex items-start justify-between gap-3">
      <div><h2 className="font-bold">{name} 편집</h2><p className="mt-1 text-xs text-[var(--color-stone)]">자주 쓰는 메뉴를 추가하고 화살표로 순서를 바꾸세요. {draft.length}/{maximumMenus}개</p></div>
      <button aria-label={name + " 편집 닫기"} className={buttonClass} disabled={saving} onClick={closeEditor} type="button"><X aria-hidden="true" className="size-4" /></button>
    </div>
    <p className="mb-3 text-xs text-[var(--color-stone)]">{authenticated ? "내 계정의 모든 기기에 같은 메뉴와 순서가 표시돼." : "로그인 전에는 이 브라우저에 메뉴와 순서를 저장해."}</p>
    <fieldset disabled={saving} className="min-w-0 space-y-3">
      <legend className="sr-only">메뉴 선택과 순서</legend>
      <ol className={isTop ? "grid gap-2 md:grid-cols-2 xl:grid-cols-3" : "space-y-2"}>{draft.map((id, index) => {
        const entry = entries.find((item) => item.id === id)!;
        const Icon = menuIcon(id);
        return <li key={id} className="flex items-center gap-1 rounded-lg border border-[var(--color-soft-border)] p-2">
          <Icon aria-hidden="true" className="mr-1 size-4 shrink-0 text-[var(--color-deep-cobalt)]" /><span className="min-w-0 flex-1 font-semibold">{entry.label}</span>
          <button type="button" aria-label={entry.label + " 위로"} disabled={index === 0} onClick={() => move(id, -1)} className={buttonClass}><ArrowUp aria-hidden="true" className="size-3.5" /></button>
          <button type="button" aria-label={entry.label + " 아래로"} disabled={index === draft.length - 1} onClick={() => move(id, 1)} className={buttonClass}><ArrowDown aria-hidden="true" className="size-3.5" /></button>
          <button type="button" aria-label={entry.label + " 제거"} onClick={() => setDraft((current) => current.filter((value) => value !== id))} className={buttonClass}><X aria-hidden="true" className="size-3.5" /></button>
        </li>;
      })}</ol>
      {draft.length === 0 ? <p>메뉴를 한 개 이상 추가해주세요.</p> : null}
      {isTop ? <label className="flex max-w-md items-center gap-2 rounded-lg border border-[var(--color-soft-border)] px-3"><Search aria-hidden="true" className="size-4" /><input ref={editorInput} aria-label="즐겨찾기 메뉴 검색" placeholder="추가할 메뉴 검색" value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-10 min-w-0 flex-1 bg-transparent outline-none focus-visible:ring-2" /></label> : null}
      <label className="block text-xs font-semibold">메뉴 추가<select aria-label={name + " 추가"} value="" disabled={draft.length >= maximumMenus} className="mt-1 min-h-10 w-full max-w-md rounded-lg border border-[var(--color-soft-border)] bg-white p-2" onChange={(event) => { const id = event.target.value as QuickMenuId; if (id) setDraft((current) => current.includes(id) || current.length >= maximumMenus ? current : [...current, id]); }}><option value="">{draft.length >= maximumMenus ? "추가하려면 기존 메뉴를 제거해주세요" : "메뉴를 선택해주세요"}</option>{entries.filter((entry) => !draft.includes(entry.id) && entry.label.includes(query.trim()) && ("href" in entry || allowCallbacks)).map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={blocked || draft.length === 0 || draft.length > maximumMenus} onClick={() => void save()} className="min-h-10 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-40">{saving ? "저장 중" : "저장"}</button><button type="button" className={buttonClass} onClick={closeEditor}>취소</button><button type="button" className={buttonClass} onClick={() => setDraft([...defaultQuickMenuIds])}>기본값</button></div>
    </fieldset>
    {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
  </div>;
}
