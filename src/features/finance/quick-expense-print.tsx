"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QuickExpensePaymentMethod, QuickExpensePrintEvidence, QuickExpenseRecord } from "./quick-expense-record";

const paymentLabels: Record<QuickExpensePaymentMethod, string> = { AUTO_DEBIT: "자동이체", BANK_TRANSFER: "계좌이체", CASH: "현금", CORPORATE_CARD: "법인카드", PERSONAL_PREPAID: "개인 선결제" };
const statusLabels: Record<QuickExpenseRecord["recordStatus"], string> = { CONVERTED: "정식결의 전환", EVIDENCE_PENDING: "증빙 확인대기", NEEDS_RESOLUTION: "정식결의 필요", RECORDED: "간편처리 완료", SOURCE_PENDING: "거래 연결대기" };
const reviewLabels = { APPROVED: "증빙 확인완료", MISSING: "증빙 미첨부", READY: "증빙 확인대기", REVIEW_REQUIRED: "증빙 검토필요", SUPPLEMENT_REQUIRED: "증빙 보완필요" } as const;

export type QuickExpensePrintTarget =
  | { kind: "record"; record: QuickExpenseRecord }
  | { kind: "month"; month: string; records: QuickExpenseRecord[] };

type EvidencePage = QuickExpensePrintEvidence & { page: number; pageCount: number; src: string };

export function getQuickExpensePrintNumber(record: QuickExpenseRecord) {
  const date = record.occurredAt.slice(0, 10).replaceAll("-", "");
  const key = record.id.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase();
  return `간지-${date}-${key || "RECORD"}`;
}

export function getQuickExpenseTransactionLabel(record: QuickExpenseRecord) {
  if (record.paymentMethod === "CORPORATE_CARD") return record.corporateCardTransactionId ? "법인카드 승인내역 연결" : "법인카드 승인내역 미연결";
  if (record.paymentMethod === "BANK_TRANSFER" || record.paymentMethod === "AUTO_DEBIT") return record.bankTransactionId ? "통장 출금거래 연결" : "통장 출금거래 미연결";
  if (record.paymentMethod === "CASH") return "현금 직접지출";
  return "개인 선결제 정산 참조";
}

export function QuickExpensePrintModal({ getPrintEvidence, onClose, target }: { getPrintEvidence?: (recordId: string) => Promise<QuickExpensePrintEvidence[]>; onClose: () => void; target: QuickExpensePrintTarget }) {
  const [evidencePages, setEvidencePages] = useState<EvidencePage[]>([]);
  const [preparingEvidence, setPreparingEvidence] = useState(target.kind === "record" && Boolean(getPrintEvidence));
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");
  const printTitle = target.kind === "record" ? `${getQuickExpensePrintNumber(target.record)}_${safeFilePart(target.record.usageDescription)}` : `간편지출_월별총괄표_${target.month}`;

  useEffect(() => {
    if (target.kind !== "record" || !getPrintEvidence) return;
    let cancelled = false;
    void getPrintEvidence(target.record.id)
      .then(prepareEvidencePages)
      .then((pages) => { if (!cancelled) setEvidencePages(pages); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "증빙 원본을 출력용으로 준비하지 못했어."); })
      .finally(() => { if (!cancelled) setPreparingEvidence(false); });
    return () => { cancelled = true; };
  }, [getPrintEvidence, target]);

  async function handlePrint() {
    const shell = document.querySelector<HTMLElement>(".quick-expense-print-shell");
    if (!shell) return;
    setPrinting(true); setError("");
    const originalTitle = document.title;
    document.title = printTitle;
    const frame = document.createElement("iframe");
    Object.assign(frame.style, { border: "0", bottom: "0", height: "1px", opacity: "0", pointerEvents: "none", position: "fixed", right: "0", width: "1px" });
    frame.setAttribute("aria-hidden", "true");
    document.body.appendChild(frame);
    try {
      const printDocument = frame.contentDocument;
      const printWindow = frame.contentWindow;
      if (!printDocument || !printWindow) throw new Error("출력 창을 준비하지 못했어.");
      const styles = Array.from(document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style')).map((node) => node.outerHTML).join("\n");
      printDocument.open();
      printDocument.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(printTitle)}</title>${styles}</head><body>${shell.outerHTML}</body></html>`);
      printDocument.close();
      await waitForPrintDocument(printDocument);
      const cleanup = () => { document.title = originalTitle; frame.remove(); };
      printWindow.addEventListener("afterprint", cleanup, { once: true });
      printWindow.focus(); printWindow.print(); window.setTimeout(cleanup, 60_000);
    } catch (reason) {
      document.title = originalTitle; frame.remove();
      setError(reason instanceof Error ? reason.message : "출력 스타일을 준비하지 못했어.");
    } finally { setPrinting(false); }
  }

  return createPortal(<div className="quick-expense-print-shell print-modal-shell fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-[var(--color-sky-wash)]/90 px-4 py-8" onClick={onClose}>
    <section aria-labelledby="quick-expense-print-title" aria-modal="true" className="w-full max-w-4xl overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-white shadow-[0_24px_80px_rgba(16,20,24,0.22)]" onClick={(event) => event.stopPropagation()} role="dialog">
      <header className="expense-resolution-print-modal-header flex items-start justify-between gap-4 border-b px-6 py-5">
        <div><h2 className="text-2xl font-bold" id="quick-expense-print-title">{target.kind === "record" ? "간편지출 기록서 출력 미리보기" : "간편지출 월별 총괄표 출력 미리보기"}</h2><p className="mt-2 text-sm text-[var(--color-stone)]">A4 세로 기준 보관용 문서와 증빙 별첨을 확인해.</p></div>
        <button aria-label="출력 미리보기 닫기" className="rounded-full border bg-white p-2" onClick={onClose} type="button"><X className="size-4" /></button>
      </header>
      <div className="print-expense-resolution grid gap-6 bg-[var(--color-cloud-veil)] p-6">
        {target.kind === "record" ? <RecordPrintPages evidencePages={evidencePages} record={target.record} /> : <MonthlyPrintPages month={target.month} records={target.records} />}
      </div>
      <footer className="expense-resolution-print-actions flex items-center justify-end gap-2 border-t px-6 py-4">
        {error ? <p className="mr-auto text-sm font-bold text-[var(--color-tangerine)]" role="alert">{error}</p> : null}
        <Button className="rounded-full" onClick={onClose} variant="outline">닫기</Button>
        <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white" disabled={preparingEvidence || printing || Boolean(error)} onClick={() => void handlePrint()}><Printer className="mr-2 size-4" />{preparingEvidence ? "증빙 준비 중…" : printing ? "출력 준비 중…" : "브라우저 프린트"}</Button>
      </footer>
    </section>
  </div>, document.body);
}

function RecordPrintPages({ evidencePages, record }: { evidencePages: EvidencePage[]; record: QuickExpenseRecord }) {
  const number = getQuickExpensePrintNumber(record);
  const totalPages = 1 + evidencePages.length;
  const review = record.evidenceReviewStatus ? reviewLabels[record.evidenceReviewStatus] : record.evidenceStatus === "NONE" ? "증빙 미첨부" : "증빙 확인대기";
  return <>
    <article className="erp-print-page expense-resolution-print-page mx-auto rounded-sm bg-white shadow-sm">
      <header className="grid grid-cols-[1fr_64mm] items-end gap-8 border-b-2 border-[var(--color-midnight-ink)] pb-5">
        <div><p className="mb-2 inline-flex rounded-full bg-[var(--color-cloud-veil)] px-2.5 py-1 text-[9px] font-bold text-[var(--color-stone)]">예산 내 일상 지출 기록</p><h3 className="text-[31px] font-black tracking-[0.12em]">간편지출 기록서</h3><p className="mt-1.5 text-[15px] font-semibold text-[var(--color-stone)]">대방동 지역주택조합</p></div>
        <div className="grid grid-cols-2 border border-[var(--color-midnight-ink)] text-center text-[11px]"><div className="border-r p-2"><p className="font-bold">거래 연결</p><p className="mt-2">{getQuickExpenseTransactionLabel(record)}</p></div><div className="p-2"><p className="font-bold">증빙 확인</p><p className="mt-2">{review}</p></div></div>
      </header>
      <section className="expense-resolution-print-section mt-6"><h4 className="mb-2 text-[15px] font-bold">기록 기본정보</h4><div className="grid grid-cols-2 border-y border-[#9ca3af]">
        <PrintCell label="관리번호" value={number} /><PrintCell label="등록일" value={dateOnly(record.createdAt)} last />
        <PrintCell label="사용일" value={dateOnly(record.occurredAt)} /><PrintCell label="결제수단" value={paymentLabels[record.paymentMethod]} last />
        <PrintCell label="거래처·사용처" value={record.counterparty || "-"} /><PrintCell label="기록자" value={record.recordedByLabel || "-"} last />
        <PrintCell label="사용내용" value={record.usageDescription} wide /><PrintCell label="예산항목" value={record.budgetItem || "-"} wide />
      </div></section>
      <section className="expense-resolution-print-section mt-5 flex items-center justify-between border-y-2 border-[var(--color-midnight-ink)] py-3"><p className="text-[17px] font-bold">지출금액</p><p className="text-[25px] font-black">{formatWon(record.amount)}</p></section>
      <section className="expense-resolution-print-section mt-5"><h4 className="mb-2 text-[15px] font-bold">거래·증빙 관리</h4><div className="grid grid-cols-2 border-y border-[#9ca3af]">
        <PrintCell label="처리상태" value={statusLabels[record.recordStatus]} /><PrintCell label="원본 연결" value={getQuickExpenseTransactionLabel(record)} last />
        <PrintCell label="증빙상태" value={review} /><PrintCell label="증빙수" value={evidencePages.length ? `${new Set(evidencePages.map((page) => page.id)).size}건 · 별첨 ${evidencePages.length}쪽` : "별첨 없음"} last />
        {record.evidenceReviewedAt ? <PrintCell label="확인일" value={dateOnly(record.evidenceReviewedAt)} wide /> : null}
        {record.missingEvidenceReason ? <PrintCell label="미첨부 사유" value={record.missingEvidenceReason} wide /> : null}
        {record.evidenceReviewNote ? <PrintCell label="검토 메모" value={record.evidenceReviewNote} wide /> : null}
      </div></section>
      <section className="mt-5 rounded-sm border border-[#9ca3af] p-4 text-[11px]"><p className="font-bold">보관 안내</p><p className="mt-1 text-[var(--color-stone)]">본 문서는 예산 내 간편지출의 거래·용도·증빙 연결을 확인하는 기록서이며 지출결의서가 아닙니다. 원본 거래와 전자 증빙은 시스템 기록을 기준으로 확인합니다.</p>{record.recordStatus === "CONVERTED" ? <p className="mt-2 font-bold text-[var(--color-tangerine)]">정식결의로 전환된 건이므로 금액 집계는 지출결의서를 기준으로 합니다.</p> : null}</section>
      <PrintFooter number={number} page={1} total={totalPages} />
    </article>
    {evidencePages.map((evidence, index) => <article className="erp-print-page expense-resolution-print-page mx-auto rounded-sm bg-white shadow-sm" key={`${evidence.id}-${evidence.page}`}>
      <header className="flex items-end justify-between gap-6 border-b-2 border-[var(--color-midnight-ink)] pb-4"><div><h3 className="text-[22px] font-black tracking-[0.08em]">간편지출 증빙자료</h3><p className="mt-1.5 text-[10px] font-semibold text-[var(--color-stone)]">{number} · {evidence.fileName}</p></div><p className="text-[10px] font-bold text-[var(--color-stone)]">{evidence.evidenceType} · {evidence.page} / {evidence.pageCount}</p></header>
      <figure className="mt-6 flex h-[205mm] items-center justify-center overflow-hidden border p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={`${evidence.fileName} 증빙 ${evidence.page}페이지`} className="max-h-full max-w-full object-contain" src={evidence.src} />
      </figure>
      <PrintFooter number={number} page={index + 2} total={totalPages} />
    </article>)}
  </>;
}

function MonthlyPrintPages({ month, records }: { month: string; records: QuickExpenseRecord[] }) {
  const pages = chunk(records, 12);
  const active = records.filter((record) => record.recordStatus !== "CONVERTED");
  const converted = records.filter((record) => record.recordStatus === "CONVERTED");
  const total = active.reduce((sum, record) => sum + record.amount, 0);
  const paymentSummary = summarize(active, (record) => paymentLabels[record.paymentMethod]);
  const budgetSummary = summarize(active, (record) => record.budgetItem || "미분류");
  return <>{(pages.length ? pages : [[]]).map((pageRecords, pageIndex) => <article className="erp-print-page expense-resolution-print-page mx-auto rounded-sm bg-white shadow-sm" key={pageIndex}>
    <header className="flex items-end justify-between gap-6 border-b-2 border-[var(--color-midnight-ink)] pb-5"><div><p className="mb-2 inline-flex rounded-full bg-[var(--color-cloud-veil)] px-2.5 py-1 text-[9px] font-bold">월별 보관대장</p><h3 className="text-[29px] font-black tracking-[0.08em]">간편지출 월별 총괄표</h3><p className="mt-1.5 text-[15px] font-semibold text-[var(--color-stone)]">대방동 지역주택조합 · {month}</p></div><div className="text-right"><p className="text-[11px] font-bold">조회 {records.length}건</p><p className="mt-1 text-[22px] font-black">{formatWon(total)}</p><p className="text-[9px] text-[var(--color-stone)]">정식결의 전환 {converted.length}건 제외</p></div></header>
    {pageIndex === 0 ? <section className="mt-5 grid grid-cols-2 gap-4"><SummaryBox title="결제수단별" values={paymentSummary} /><SummaryBox title="예산항목별" values={budgetSummary} /></section> : null}
    <section className="mt-5"><div className="mb-2 flex items-end justify-between"><h4 className="text-[15px] font-bold">간편지출 기록</h4><p className="text-[10px] text-[var(--color-stone)]">전환 건은 참고표시만 하며 합계에서 제외</p></div><table className="w-full table-fixed border-collapse text-[9px]"><colgroup><col className="w-[7%]"/><col className="w-[12%]"/><col className="w-[12%]"/><col className="w-[18%]"/><col className="w-[21%]"/><col className="w-[15%]"/><col className="w-[15%]"/></colgroup><thead><tr className="bg-[var(--color-cloud-veil)]">{["순번","사용일","결제","거래처","사용내용·예산","상태","금액"].map((label)=><th className="border px-1 py-2" key={label}>{label}</th>)}</tr></thead><tbody>{pageRecords.map((record,index)=><tr className={record.recordStatus === "CONVERTED" ? "text-[var(--color-stone)]" : ""} key={record.id}><td className="border p-1.5 text-center">{pageIndex*12+index+1}</td><td className="border p-1.5 text-center">{dateOnly(record.occurredAt).slice(5)}</td><td className="border p-1.5 text-center">{paymentLabels[record.paymentMethod]}</td><td className="border p-1.5">{record.counterparty}</td><td className="border p-1.5"><p className="font-semibold">{record.usageDescription}</p><p className="mt-0.5 text-[8px] text-[var(--color-stone)]">{record.budgetItem}</p></td><td className="border p-1.5 text-center">{statusLabels[record.recordStatus]}</td><td className="border p-1.5 text-right font-bold">{formatWon(record.amount)}</td></tr>)}</tbody></table></section>
    {pageIndex === pages.length - 1 ? <section className="mt-5 border-y-2 border-[var(--color-midnight-ink)] py-3"><div className="flex justify-between font-bold"><span>간편지출 관리합계</span><span>{formatWon(total)}</span></div>{converted.length ? <div className="mt-2 flex justify-between text-[10px] text-[var(--color-stone)]"><span>정식결의 전환 참고금액</span><span>{formatWon(converted.reduce((sum, record) => sum + record.amount, 0))}</span></div> : null}</section> : null}
    <PrintFooter number={`간편지출-${month}`} page={pageIndex + 1} total={Math.max(pages.length, 1)} />
  </article>)}</>;
}

function PrintCell({ label, last, value, wide }: { label: string; last?: boolean; value: React.ReactNode; wide?: boolean }) { return <div className={`grid grid-cols-[31mm_1fr] border-b ${wide ? "col-span-2" : ""} ${last ? "border-r-0" : "border-r"}`}><p className="bg-[var(--color-cloud-veil)] px-3 py-2 font-bold">{label}</p><div className="px-3 py-2 text-center font-semibold">{value}</div></div>; }
function SummaryBox({ title, values }: { title: string; values: { amount: number; count: number; label: string }[] }) { return <div className="border p-3"><h4 className="mb-2 text-[12px] font-bold">{title}</h4><div className="grid gap-1 text-[9px]">{values.slice(0,5).map((item)=><div className="flex justify-between gap-2" key={item.label}><span className="truncate">{item.label} · {item.count}건</span><span className="font-bold">{formatWon(item.amount)}</span></div>)}</div></div>; }
function PrintFooter({ number, page, total }: { number: string; page: number; total: number }) { return <footer className="mt-auto flex items-end justify-between gap-6 border-t pt-4 text-[9px] text-[var(--color-stone)]"><div><p className="text-[12px] font-bold text-[var(--color-midnight-ink)]">대방동 지역주택조합</p><p className="mt-1">월별 총괄표와 건별 기록서·증빙을 함께 편철하여 보관합니다.</p></div><p>{number} · 출력일 {new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })} · {page} / {total}</p></footer>; }

async function prepareEvidencePages(evidence: QuickExpensePrintEvidence[]) {
  const pages: EvidencePage[] = [];
  for (const item of evidence) {
    const response = await fetch(item.signedUrl);
    if (!response.ok) throw new Error(`${item.fileName} 증빙 원본을 불러오지 못했어.`);
    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || item.contentType.toLowerCase();
    if (contentType === "application/pdf" || item.fileName.toLowerCase().endsWith(".pdf")) {
      const images = await renderPdf(await response.arrayBuffer());
      images.forEach((src, index) => pages.push({ ...item, page: index + 1, pageCount: images.length, src }));
    } else if (contentType.startsWith("image/") || item.contentType.startsWith("image/")) pages.push({ ...item, page: 1, pageCount: 1, src: await blobToDataUrl(await response.blob()) });
  }
  return pages;
}

async function renderPdf(data: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const images: string[] = [];
  try { for (let pageNo=1;pageNo<=pdf.numPages;pageNo+=1) { const page=await pdf.getPage(pageNo); const viewport=page.getViewport({scale:2.4}); const canvas=document.createElement("canvas"); canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height); await page.render({canvas,intent:"print",viewport}).promise; images.push(canvas.toDataURL("image/jpeg",0.94)); page.cleanup(); } } finally { await pdf.destroy(); }
  return images;
}

function blobToDataUrl(blob: Blob) { return new Promise<string>((resolve,reject)=>{ const reader=new FileReader(); reader.addEventListener("load",()=>resolve(String(reader.result))); reader.addEventListener("error",()=>reject(reader.error)); reader.readAsDataURL(blob); }); }
function dateOnly(value: string) { return value ? value.slice(0,10) : "-"; }
function formatWon(value: number) { return `${value.toLocaleString("ko-KR")}원`; }
function safeFilePart(value: string) { return value.replace(/[\\/:*?"<>|]/g,"_").trim().slice(0,50) || "간편지출"; }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g,(character)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]!); }
function chunk<T>(values: T[], size: number) { return Array.from({length:Math.ceil(values.length/size)},(_,index)=>values.slice(index*size,(index+1)*size)); }
function summarize(records: QuickExpenseRecord[], label: (record: QuickExpenseRecord)=>string) { const map=new Map<string,{amount:number;count:number;label:string}>(); records.forEach((record)=>{const key=label(record);const current=map.get(key)??{amount:0,count:0,label:key};current.amount+=record.amount;current.count+=1;map.set(key,current);}); return [...map.values()].sort((a,b)=>b.amount-a.amount); }
async function waitForPrintDocument(document: Document) { await Promise.all(Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map((link)=>new Promise<void>((resolve)=>{ if (link.sheet) return resolve(); link.addEventListener("load",()=>resolve(),{once:true}); link.addEventListener("error",()=>resolve(),{once:true}); }))); if (document.fonts) await document.fonts.ready; await Promise.all(Array.from(document.images).map((image)=>image.complete?Promise.resolve():new Promise<void>((resolve)=>{image.addEventListener("load",()=>resolve(),{once:true});image.addEventListener("error",()=>resolve(),{once:true});}))); }
