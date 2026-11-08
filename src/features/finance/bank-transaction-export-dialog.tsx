"use client";

import { useMemo, useState } from "react";

import {
  bankTransactionExportColumns,
  defaultBankTransactionExportColumns,
  type BankTransactionExportColumnId,
} from "./bank-transaction-export-columns";
import type { BankTransactionListFilters } from "./bank-transaction-repository";

type Props = {
  filters: BankTransactionListFilters;
  totalCount: number;
};

export function BankTransactionExportDialog({ filters, totalCount }: Props) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<"xlsx" | "pdf">("xlsx");
  const [columns, setColumns] = useState<BankTransactionExportColumnId[]>([...defaultBankTransactionExportColumns]);
  const [title, setTitle] = useState("은행 거래내역");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pdfTooLarge = format === "pdf" && totalCount > 1_000;
  const orderedColumns = useMemo(() => columns.map((id) => bankTransactionExportColumns.find((column) => column.id === id)).filter(Boolean), [columns]);

  function toggleColumn(id: BankTransactionExportColumnId) {
    setColumns((current) => current.includes(id) ? current.filter((column) => column !== id) : [...current, id]);
  }

  function moveColumn(id: BankTransactionExportColumnId, direction: -1 | 1) {
    setColumns((current) => {
      const index = current.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function download() {
    setError("");
    if (!columns.length) { setError("내보낼 컬럼을 한 개 이상 선택해줘."); return; }
    if (format === "pdf" && columns.length > 10) { setError("PDF는 컬럼을 10개 이하로 선택해줘."); return; }
    if (pdfTooLarge) { setError("PDF는 1,000건까지 만들 수 있어. 검색 조건을 좁히거나 엑셀을 선택해줘."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/finance/bank-transactions/export", {
        body: JSON.stringify({ columns, filters, format, title }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(payload.message || "파일을 만들지 못했어.");
      }
      const blob = await response.blob();
      const fallback = `bank-transactions.${format}`;
      const fileName = response.headers.get("X-Export-Filename") || fallback;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "파일을 만들지 못했어.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="rounded-lg border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm font-bold text-[var(--color-midnight-ink)]" onClick={() => setOpen(true)} type="button">
        검색 결과 내보내기
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
          <section aria-labelledby="bank-export-title" aria-modal="true" className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl" role="dialog">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-xl font-black" id="bank-export-title">검색 결과 내보내기</h2><p className="mt-1 text-sm text-[var(--color-stone)]">현재 검색 조건의 {totalCount.toLocaleString("ko-KR")}건을 선택한 컬럼 순서로 내려받아.</p></div>
              <button aria-label="닫기" className="rounded-lg border px-3 py-1.5 font-bold" onClick={() => setOpen(false)} type="button">닫기</button>
            </div>
            <label className="mt-5 grid gap-1 text-sm font-bold">보고서 제목<input className="h-10 rounded-lg border border-[var(--color-soft-border)] px-3 font-normal" maxLength={80} onChange={(event) => setTitle(event.target.value)} value={title} /></label>
            <fieldset className="mt-4"><legend className="text-sm font-bold">파일 형식</legend><div className="mt-2 flex gap-4"><label className="flex items-center gap-2"><input checked={format === "xlsx"} name="format" onChange={() => setFormat("xlsx")} type="radio" />엑셀(.xlsx)</label><label className="flex items-center gap-2"><input checked={format === "pdf"} name="format" onChange={() => setFormat("pdf")} type="radio" />PDF</label></div></fieldset>
            {pdfTooLarge ? <p className="mt-2 rounded-lg bg-[var(--color-butter-soft)] px-3 py-2 text-sm font-semibold text-[var(--color-mustard)]">PDF는 1,000건까지 지원해. 검색 조건을 좁히거나 엑셀로 내보내줘.</p> : null}
            <fieldset className="mt-5"><legend className="text-sm font-bold">내보낼 컬럼과 순서</legend><p className="mt-1 text-xs text-[var(--color-stone)]">기본값은 거래일·일시·계좌·적요·거래내역·금액·계정과목이야.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {bankTransactionExportColumns.map((column) => {
                  const selected = columns.includes(column.id);
                  const order = columns.indexOf(column.id);
                  return <div className={`flex items-center gap-2 rounded-lg border p-2 ${selected ? "border-[var(--color-green-ink)] bg-[var(--color-morning-tint)]/40" : "border-[var(--color-soft-border)]"}`} key={column.id}>
                    <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold"><input checked={selected} onChange={() => toggleColumn(column.id)} type="checkbox" /><span>{column.label}{"sensitive" in column && column.sensitive ? <small className="ml-1 text-[var(--color-mustard)]">내부정보</small> : null}</span></label>
                    {selected ? <><span className="text-xs tabular-nums text-[var(--color-stone)]">{order + 1}</span><button aria-label={`${column.label} 앞으로`} className="rounded border px-2 py-1 text-xs" disabled={order === 0} onClick={() => moveColumn(column.id, -1)} type="button">↑</button><button aria-label={`${column.label} 뒤로`} className="rounded border px-2 py-1 text-xs" disabled={order === columns.length - 1} onClick={() => moveColumn(column.id, 1)} type="button">↓</button></> : null}
                  </div>;
                })}
              </div>
            </fieldset>
            <div className="mt-4 rounded-lg bg-[var(--color-cloud-veil)] px-3 py-2 text-sm"><strong>선택 순서:</strong> {orderedColumns.map((column) => column?.label).join(" → ") || "선택 없음"}</div>
            {error ? <p className="mt-3 rounded-lg bg-[var(--color-sunset-soft)] px-3 py-2 text-sm font-semibold text-[var(--color-tangerine)]" role="alert">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2"><button className="rounded-lg border px-4 py-2 font-bold" onClick={() => setOpen(false)} type="button">취소</button><button className="rounded-lg bg-[var(--color-pressed-charcoal)] px-4 py-2 font-bold text-white disabled:opacity-50" disabled={busy || !columns.length || pdfTooLarge} onClick={download} type="button">{busy ? "파일 만드는 중…" : `${format === "pdf" ? "PDF" : "엑셀"} 내려받기`}</button></div>
          </section>
        </div>
      ) : null}
    </>
  );
}
