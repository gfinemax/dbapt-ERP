"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { isIsoDay } from "@/features/approval/approval-effective-policy";
import { policySummary } from "./expense-approval-period";
import { formatExpenseResolutionAmount } from "./expense-resolution-data";
import type { ExpenseEvidenceAttachment } from "./expense-evidence";
import { normalizeExpenseTiming, type ExpenseTiming } from "./expense-resolution-domain";
import {
  buildExpenseResolutionPdfFileName,
  formatApprovalDateTime,
  getDocumentApprovalParticipants,
  getExpensePrintEvidenceText,
  getExpensePrintItemDescription,
  getExpensePrintPersonName,
  getResolutionSubject,
  toNumber,
  type ManagedExpenseResolution,
  type SingleExpenseTaxCategory,
} from "./expense-resolution-page";

function escapeHtmlText(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function getExpenseTimingLabel(timing: ExpenseTiming) {
  return timing === "ADVANCE" ? "사전 집행결의" : timing === "REIMBURSEMENT" ? "사후 지출결의" : "선지급금 정산";
}

function getCurrentDateIso() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).format(new Date());
}

export async function waitForExpensePrintLayout(printDocument: Document, printWindow: Window, timeoutMs = 8_000) {
  const styleLinks = Array.from(printDocument.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
  const stylesReady = Promise.all(styleLinks.map((link) => {
    if (link.sheet) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      link.addEventListener("load", () => resolve(), { once: true });
      link.addEventListener("error", () => reject(new Error("출력용 스타일시트를 불러오지 못했습니다.")), { once: true });
    });
  }));
  const timeout = new Promise<never>((_, reject) => {
    printWindow.setTimeout(() => reject(new Error("출력 스타일 준비 시간이 초과되었습니다. 다시 시도해주세요.")), timeoutMs);
  });

  await Promise.race([stylesReady, timeout]);
  if (printDocument.fonts?.ready) await Promise.race([printDocument.fonts.ready, timeout]);
  await new Promise<void>((resolve) => printWindow.setTimeout(resolve, 0));
  await new Promise<void>((resolve) => printWindow.setTimeout(resolve, 0));

  const header = printDocument.querySelector<HTMLElement>(".expense-resolution-print-header");
  if (!header || printWindow.getComputedStyle(header).display !== "grid") {
    throw new Error("출력 스타일이 적용되지 않았습니다. 잠시 후 다시 시도해주세요.");
  }
}

export function getExpensePrintAmountSummary(input: {
  actualUsedAmount?: number;
  advancePaidAmount?: number;
  settlementDifference?: number;
  timing: ExpenseTiming;
  totalPaymentAmount: number;
}) {
  if (input.timing === "SETTLEMENT") {
    const advanceAmount = input.advancePaidAmount ?? 0;
    const expenseAmount = input.actualUsedAmount ?? input.totalPaymentAmount;
    const difference = input.settlementDifference ?? advanceAmount - expenseAmount;
    return {
      items: [
        { label: "선지급액", value: advanceAmount },
        { label: "총 지출액", value: expenseAmount },
        { label: difference > 0 ? "반납액" : difference < 0 ? "추가 지급액" : "정산차액", value: Math.abs(difference) },
      ],
      primaryLabel: "총 지출액",
      primaryValue: expenseAmount,
    };
  }
  return {
    items: [],
    primaryLabel: input.timing === "REIMBURSEMENT" ? "총 지출액" : "총 결의금액",
    primaryValue: input.totalPaymentAmount,
  };
}

type ExpenseEvidencePrintPage = {
  evidenceType: string;
  fileName: string;
  id: string;
  sourcePage: number;
  sourcePageCount: number;
  src: string;
};

async function prepareExpenseEvidencePrintPages(
  evidenceFiles: ExpenseEvidenceAttachment[],
  createEvidenceDownloadUrl: (storagePath: string) => Promise<string>,
) {
  const printPages: ExpenseEvidencePrintPage[] = [];
  for (const evidence of evidenceFiles) {
    const signedUrl = await createEvidenceDownloadUrl(evidence.storagePath);
    const response = await fetch(signedUrl);
    if (!response.ok) throw new Error(`${evidence.fileName} 증빙 원본을 불러오지 못했습니다.`);
    const responseContentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    const contentType = responseContentType || evidence.contentType.toLowerCase();
    const isPdf = contentType === "application/pdf" || evidence.storagePath.toLowerCase().endsWith(".pdf") || evidence.fileName.toLowerCase().endsWith(".pdf");
    const isImage = contentType.startsWith("image/") || evidence.contentType.startsWith("image/");

    if (isPdf) {
      const pageImages = await renderExpenseEvidencePdfPages(await response.arrayBuffer());
      pageImages.forEach((src, pageIndex) => {
        printPages.push({
          evidenceType: evidence.ocrData.normalizedEvidenceType || evidence.evidenceType,
          fileName: evidence.fileName,
          id: `${evidence.id}-pdf-${pageIndex + 1}`,
          sourcePage: pageIndex + 1,
          sourcePageCount: pageImages.length,
          src,
        });
      });
    } else if (isImage) {
      printPages.push({
        evidenceType: evidence.ocrData.normalizedEvidenceType || evidence.evidenceType,
        fileName: evidence.fileName,
        id: `${evidence.id}-image`,
        sourcePage: 1,
        sourcePageCount: 1,
        src: await blobToDataUrl(await response.blob()),
      });
    }
  }
  return printPages;
}

async function renderExpenseEvidencePdfPages(data: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const document = await pdfjs.getDocument({ data }).promise;
  const pageImages: string[] = [];
  try {
    for (let pageNo = 1; pageNo <= document.numPages; pageNo += 1) {
      const page = await document.getPage(pageNo);
      const viewport = page.getViewport({ scale: 2.4 });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, intent: "print", viewport }).promise;
      pageImages.push(canvas.toDataURL("image/jpeg", 0.94));
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }
  return pageImages;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("증빙 이미지를 변환하지 못했습니다.")));
    reader.readAsDataURL(blob);
  });
}

export function paginateExpensePrintRowHeights({
  continuationPageBudget,
  finalBlockHeight,
  firstPageBudget,
  rowHeights,
}: {
  continuationPageBudget: number;
  finalBlockHeight: number;
  firstPageBudget: number;
  rowHeights: number[];
}) {
  if (rowHeights.length === 0) return [0];

  const normalizedRows = rowHeights.map((height) => Math.max(1, height));
  const normalizedFinalBlockHeight = Math.max(0, finalBlockHeight);
  const pageCounts: number[] = [];
  let rowIndex = 0;
  let pageIndex = 0;

  while (rowIndex < normalizedRows.length) {
    const pageBudget = Math.max(1, pageIndex === 0 ? firstPageBudget : continuationPageBudget);
    const remainingRows = normalizedRows.slice(rowIndex);
    const remainingHeight = remainingRows.reduce((sum, height) => sum + height, 0);

    if (remainingHeight + normalizedFinalBlockHeight <= pageBudget) {
      pageCounts.push(remainingRows.length);
      rowIndex = normalizedRows.length;
      break;
    }

    let usedHeight = 0;
    let fittingCount = 0;
    while (rowIndex + fittingCount < normalizedRows.length) {
      const nextHeight = normalizedRows[rowIndex + fittingCount];
      if (fittingCount > 0 && usedHeight + nextHeight > pageBudget) break;
      usedHeight += nextHeight;
      fittingCount += 1;
      if (usedHeight > pageBudget) break;
    }

    const remainingCount = normalizedRows.length - rowIndex;
    if (fittingCount >= remainingCount) {
      const finalRowHeight = normalizedRows.at(-1) ?? 0;
      if (remainingCount > 1 && finalRowHeight + normalizedFinalBlockHeight <= continuationPageBudget) {
        fittingCount = remainingCount - 1;
      } else {
        pageCounts.push(remainingCount);
        rowIndex = normalizedRows.length;
        pageCounts.push(0);
        break;
      }
    }

    pageCounts.push(Math.max(1, fittingCount));
    rowIndex += Math.max(1, fittingCount);
    pageIndex += 1;
  }

  return pageCounts;
}

function getFallbackExpensePrintPageCounts(itemCount: number) {
  const pageCounts = [Math.min(itemCount, 5)];
  let remainingCount = Math.max(0, itemCount - 5);
  while (remainingCount > 0) {
    pageCounts.push(Math.min(remainingCount, 7));
    remainingCount -= 7;
  }
  return pageCounts;
}

export function ExpenseResolutionPrintPreviewModal({
  createEvidenceDownloadUrl,
  onClose,
  resolution,
}: {
  createEvidenceDownloadUrl?: (storagePath: string) => Promise<string>;
  onClose: () => void;
  resolution: ManagedExpenseResolution;
}) {
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
  const [printPreparationError, setPrintPreparationError] = useState("");
  const [evidencePrintPages, setEvidencePrintPages] = useState<ExpenseEvidencePrintPage[]>([]);
  const [isEvidencePreparing, setIsEvidencePreparing] = useState(Boolean((resolution.evidenceFiles?.length ?? 0) && createEvidenceDownloadUrl));
  const printStackRef = useRef<HTMLDivElement>(null);
  const continuationProbeRef = useRef<HTMLElement>(null);
  const [measuredPagination, setMeasuredPagination] = useState<{ key: string; pageCounts: number[] } | null>(null);
  const vendorMissing = !resolution.vendorName.trim() || resolution.vendorName === "거래처 미입력";
  const reasonText = resolution.reason.trim() || "지출사유 미입력";
  const warningTextClass = "font-bold text-[var(--color-tangerine)]";
  const isBatchResolution = resolution.resolutionType === "BATCH";
  const expenseTiming = normalizeExpenseTiming(resolution);
  const printAmountSummary = getExpensePrintAmountSummary({
    actualUsedAmount: resolution.actualUsedAmount,
    advancePaidAmount: resolution.advancePaidAmount,
    settlementDifference: resolution.settlementDifference,
    timing: expenseTiming,
    totalPaymentAmount: resolution.totalPaymentAmount,
  });
  const printExpenseItems = isBatchResolution
    ? resolution.expenseItems.map((item) => ({ ...item, description: getExpensePrintItemDescription(item) }))
    : resolution.singleItems?.length
      ? resolution.singleItems.map((item, index) => ({
          description: item.itemName + (item.memo ? `\n${item.memo}` : ""),
          expenseDate: resolution.plannedPaymentDate || resolution.actualExpenseDate || "",
          id: item.id,
          itemNo: index + 1,
          supplyAmount: String(item.supplyAmount),
          taxCategory: item.taxCategory,
          totalAmount: item.totalAmount,
          vatAmount: String(item.vatAmount),
          vendorName: resolution.vendorName,
        }))
      : [
        {
          id: `${resolution.id}-print-item`,
          itemNo: 1,
          expenseDate: resolution.plannedPaymentDate || resolution.actualExpenseDate || "",
          vendorName: resolution.vendorName,
          itemTitle: resolution.operationExpenseDetail || resolution.expenseType,
          accountTitle: resolution.expenseType,
          budgetItem: resolution.budgetItem,
          description: resolution.budgetSnapshot.calculationBasis,
          supplyAmount: String(resolution.supplyAmount),
          vatAmount: String(resolution.vat),
          totalAmount: resolution.totalPaymentAmount,
        },
        ];
  const evidenceText = getExpensePrintEvidenceText(resolution);
  const paginationKey = `${resolution.id}|${printExpenseItems.map((item) => `${item.id}:${item.description}:${item.vendorName}`).join("|")}|${reasonText}|${evidenceText}`;
  const fallbackPageCounts = getFallbackExpensePrintPageCounts(printExpenseItems.length);
  const pageCounts = measuredPagination?.key === paginationKey ? measuredPagination.pageCounts : fallbackPageCounts;
  const printItemPages = pageCounts.map((pageItemCount, pageIndex) => {
    const startIndex = pageCounts.slice(0, pageIndex).reduce((sum, count) => sum + count, 0);
    return printExpenseItems.slice(startIndex, startIndex + pageItemCount);
  });
  const firstPageItems = printItemPages[0] ?? [];
  const continuationPages = printItemPages.slice(1);
  const totalPrintPages = 1 + continuationPages.length + evidencePrintPages.length;
  const evidenceConnectionError = (resolution.evidenceFiles?.length ?? 0) > 0 && !createEvidenceDownloadUrl
    ? "증빙 원본을 출력할 수 있도록 연결되지 않았습니다."
    : "";
  const displayedPrintError = printPreparationError || evidenceConnectionError;

  useEffect(() => {
    const printStack = printStackRef.current;
    if (!printStack) return;

    let cancelled = false;
    let animationFrame = 0;

    const measurePagination = () => {
      if (cancelled) return;
      const firstPage = printStack.querySelector<HTMLElement>('[data-expense-print-page="first"]');
      const continuationProbe = continuationProbeRef.current;
      const firstItemsSection = firstPage?.querySelector<HTMLElement>(".expense-resolution-print-items");
      const probeItemsSection = continuationProbe?.querySelector<HTMLElement>(".expense-resolution-print-items");
      const firstBody = firstItemsSection?.querySelector<HTMLElement>("tbody");
      const probeBody = probeItemsSection?.querySelector<HTMLElement>("tbody");
      const firstFoot = firstItemsSection?.querySelector<HTMLElement>("tfoot");
      const probeFoot = probeItemsSection?.querySelector<HTMLElement>("tfoot");
      const firstFooter = firstPage?.querySelector<HTMLElement>("[data-expense-print-footer]");
      const probeFooter = continuationProbe?.querySelector<HTMLElement>("[data-expense-print-footer]");
      const reasonBlock = continuationProbe?.querySelector<HTMLElement>(".expense-resolution-print-reason");
      const itemRows = Array.from(printStack.querySelectorAll<HTMLElement>(".expense-resolution-document-page .expense-resolution-print-item-row"));

      if (!firstPage || !continuationProbe || !firstBody || !probeBody || !firstFoot || !probeFoot || !firstFooter || !probeFooter || !reasonBlock) return;
      if (itemRows.length !== printExpenseItems.length) return;

      const getRowBudget = (page: HTMLElement, body: HTMLElement, foot: HTMLElement, footer: HTMLElement) => {
        const pageRect = page.getBoundingClientRect();
        const bodyRect = body.getBoundingClientRect();
        const footRect = foot.getBoundingClientRect();
        const footerRect = footer.getBoundingClientRect();
        const pageStyle = window.getComputedStyle(page);
        const paddingBottom = Number.parseFloat(pageStyle.paddingBottom) || 0;
        const footerTop = pageRect.bottom - paddingBottom - footerRect.height;
        return footerTop - bodyRect.top - footRect.height - 8;
      };
      const firstPageBudget = getRowBudget(firstPage, firstBody, firstFoot, firstFooter);
      const continuationPageBudget = getRowBudget(continuationProbe, probeBody, probeFoot, probeFooter);
      const reasonStyle = window.getComputedStyle(reasonBlock);
      const finalBlockHeight = reasonBlock.getBoundingClientRect().height
        + (Number.parseFloat(reasonStyle.marginTop) || 0)
        + (Number.parseFloat(reasonStyle.marginBottom) || 0);
      const rowHeights = itemRows.map((row) => row.getBoundingClientRect().height);

      if (firstPageBudget <= 0 || continuationPageBudget <= 0 || finalBlockHeight <= 0 || rowHeights.some((height) => height <= 0)) return;

      const nextPageCounts = paginateExpensePrintRowHeights({
        continuationPageBudget,
        finalBlockHeight,
        firstPageBudget,
        rowHeights,
      });
      setMeasuredPagination((current) => {
        if (current?.key === paginationKey && current.pageCounts.length === nextPageCounts.length && current.pageCounts.every((count, index) => count === nextPageCounts[index])) return current;
        return { key: paginationKey, pageCounts: nextPageCounts };
      });
    };
    const scheduleMeasurement = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(measurePagination);
    };

    scheduleMeasurement();
    void document.fonts?.ready.then(scheduleMeasurement);
    window.addEventListener("resize", scheduleMeasurement);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", scheduleMeasurement);
    };
  }, [paginationKey, printExpenseItems.length]);

  useEffect(() => {
    const evidenceFiles = resolution.evidenceFiles ?? [];
    if (!evidenceFiles.length || !createEvidenceDownloadUrl) return;

    let cancelled = false;
    void prepareExpenseEvidencePrintPages(evidenceFiles, createEvidenceDownloadUrl)
      .then((pages) => {
        if (!cancelled) setEvidencePrintPages(pages);
      })
      .catch((error) => {
        if (!cancelled) setPrintPreparationError(error instanceof Error ? error.message : "증빙 원본을 출력용으로 준비하지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setIsEvidencePreparing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [createEvidenceDownloadUrl, resolution.evidenceFiles]);

  async function handleBrowserPrint() {
    const printShell = document.querySelector<HTMLElement>(".print-modal-shell");
    if (!printShell) return;
    setIsPreparingPrint(true);
    setPrintPreparationError("");

    const pdfFileName = buildExpenseResolutionPdfFileName(resolution.resolutionNo, getResolutionSubject(resolution));
    const printTitle = pdfFileName.replace(/\.pdf$/i, "");
    const originalDocumentTitle = document.title;
    let titleRestored = false;
    const restoreDocumentTitle = () => {
      if (titleRestored) return;
      titleRestored = true;
      document.title = originalDocumentTitle;
    };

    // Chrome uses the top-level document title, rather than the hidden print
    // iframe title, as the suggested "Save as PDF" file name.
    document.title = printTitle;

    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "1px";
    frame.style.height = "1px";
    frame.style.border = "0";
    frame.style.opacity = "0";
    frame.style.pointerEvents = "none";
    document.body.appendChild(frame);

    const printDocument = frame.contentDocument;
    const printWindow = frame.contentWindow;
    if (!printDocument || !printWindow) {
      frame.remove();
      restoreDocumentTitle();
      return;
    }

    const styles = Array.from(document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style'))
      .map((node) => node.outerHTML)
      .join("\n");

    printDocument.open();
    printDocument.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtmlText(printTitle)}</title>${styles}</head><body>${printShell.outerHTML}</body></html>`);
    printDocument.close();

    try {
      await waitForExpensePrintLayout(printDocument, printWindow);
      const cleanup = () => {
        restoreDocumentTitle();
        frame.remove();
      };
      printWindow.addEventListener("afterprint", cleanup, { once: true });
      printWindow.focus();
      printWindow.print();
      window.setTimeout(cleanup, 60_000);
    } catch (error) {
      frame.remove();
      restoreDocumentTitle();
      setPrintPreparationError(error instanceof Error ? error.message : "출력 스타일을 준비하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setIsPreparingPrint(false);
    }
  }

  return createPortal(
    <div className="print-modal-shell expense-resolution-document-shell fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[var(--color-sky-wash)]/88 px-4 py-8" onClick={onClose}>
      <section
        aria-labelledby="expense-resolution-print-title"
        aria-modal="true"
        className="w-full max-w-4xl overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] shadow-[0_24px_80px_rgba(16,20,24,0.22)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="expense-resolution-print-modal-header flex items-start justify-between gap-4 border-b border-[var(--color-soft-border)] px-6 py-5">
          <div>
            <h2 className="text-2xl font-bold" id="expense-resolution-print-title">
              지출결의서 출력 미리보기
            </h2>
            <p className="mt-2 text-sm text-[var(--color-stone)]">A4 세로 보관용 문서를 확인합니다.</p>
          </div>
          <button aria-label="출력 미리보기 닫기" className="rounded-full border border-[var(--color-soft-border)] bg-white p-2 text-[var(--color-stone)]" onClick={onClose} type="button">
            <X className="size-4" />
          </button>
        </div>

        <div className="print-expense-resolution expense-resolution-document-stack bg-[var(--color-cloud-veil)] p-6" ref={printStackRef}>
          <article className="erp-print-page expense-resolution-print-page expense-resolution-document-page mx-auto rounded-sm bg-white shadow-sm" data-expense-print-page="first">
            <header className="expense-resolution-print-header grid grid-cols-[1fr_70mm] items-center gap-6 border-b-2 border-[var(--color-midnight-ink)] pb-4">
              <div className="min-w-0">
                <p className="mb-2 inline-flex rounded-full bg-[var(--color-cloud-veil)] px-2.5 py-1 text-[9px] font-bold text-[var(--color-stone)]">{getExpenseTimingLabel(expenseTiming)}</p>
                <h3 className="text-[35px] font-black tracking-[0.16em]">지출결의서</h3>
                {resolution.correctionRevision ? <p className="text-xs font-bold">정정본 v{resolution.correctionRevision + 1}</p> : null}
                <p className="mt-1.5 text-[15px] font-semibold text-[var(--color-stone)]">대방동 지역주택조합</p>
              </div>
              <ExpenseApprovalBox resolution={resolution} />
            </header>

            <section className="expense-resolution-print-section mt-4">
              <h4 className="mb-2 text-[15px] font-bold">핵심 결의정보</h4>
              <div className="grid grid-cols-2 border-y border-solid border-[#9ca3af]">
                <PrintCell label="결의서번호" value={resolution.resolutionNo} />
                <PrintCell className="border-r-0" label="작성일" value={resolution.createdAt} />
                {isBatchResolution ? <PrintCell label="프로젝트명" value={<span className={resolution.projectName.trim() ? "" : warningTextClass}>{resolution.projectName.trim() || "프로젝트 미입력"}</span>} wide /> : null}
                <PrintCell label="건명" value={getResolutionSubject(resolution)} wide />
                <PrintCell label="거래처" value={<span className={vendorMissing ? warningTextClass : ""}>{resolution.vendorName || "거래처 미입력"}</span>} />
                <PrintCell className="border-r-0" label="예산항목" value={resolution.budgetItem || "-"} />
                <PrintCell label="작성자" value={getExpensePrintPersonName(resolution.author)} />
                <PrintCell className="border-r-0" label="지출일" value={resolution.plannedPaymentDate || resolution.actualExpenseDate || "-"} />
                {resolution.expenseKind === "PERSONAL_REIMBURSEMENT" ? <PrintCell label="정산정보" value={`${resolution.settlementRecipient ?? resolution.advancePayer ?? "-"} · ${resolution.settlementStatus}`} wide /> : null}
              </div>
            </section>

            <section className="expense-resolution-print-section mt-4 border-y-2 border-[var(--color-midnight-ink)] py-2.5">
              {expenseTiming === "SETTLEMENT" ? (
                <div className="grid grid-cols-3 gap-4">
                  {printAmountSummary.items.map((item) => (
                    <div className="border-r border-[var(--color-soft-border)] px-3 last:border-r-0" key={item.label}>
                      <p className="text-xs font-bold text-[var(--color-stone)]">{item.label}</p>
                      <p className="mt-1 text-right text-xl font-black tracking-tight">{formatExpenseResolutionAmount(item.value)}</p>
                    </div>
                  ))}
                </div>
              ) : <div className="flex items-center justify-between gap-4">
                <p className="text-[17px] font-bold">{printAmountSummary.primaryLabel}</p>
                <p className="text-[25px] font-black tracking-tight">{formatExpenseResolutionAmount(printAmountSummary.primaryValue)}</p>
              </div>}
            </section>

            <section className="expense-resolution-print-section expense-resolution-print-items mt-4">
              <div className="mb-2 flex items-end justify-between gap-3">
                <h4 className="text-[15px] font-bold">세부 지출내역</h4>
                {isBatchResolution ? <p className="text-xs font-semibold text-[var(--color-stone)]">{resolution.projectName.trim() || "프로젝트 미입력"} · {printExpenseItems.length}건</p> : null}
              </div>
              <ExpensePrintItemsTable items={firstPageItems} totalLabel={continuationPages.length ? "본지 소계" : "전체 합계"} />
            </section>

            {continuationPages.length === 0 ? <ExpensePrintReasonEvidence evidenceText={evidenceText} reasonText={reasonText} resolution={resolution} warningTextClass={warningTextClass} /> : null}

            <ExpensePrintFooter page={1} resolutionNo={resolution.resolutionNo} totalPages={totalPrintPages} />
          </article>
          {continuationPages.map((items, pageIndex) => (
            <article className="erp-print-page expense-resolution-print-page expense-resolution-document-page expense-resolution-continuation-page mx-auto mt-6 rounded-sm bg-white shadow-sm" data-expense-print-page="continuation" key={`continuation-${pageIndex + 1}`}>
              <header className="border-b-2 border-[var(--color-midnight-ink)] pb-4">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold">세부 지출내역 (계속)</h3>
                    <p className="mt-1 font-semibold">{resolution.resolutionNo} · {getResolutionSubject(resolution)}</p>
                    {isBatchResolution ? <p className="mt-1 text-xs text-[var(--color-stone)]">프로젝트: {resolution.projectName || "프로젝트 미입력"}</p> : null}
                  </div>
                  <p className="text-xs font-semibold text-[var(--color-stone)]">{pageIndex + 2} / {totalPrintPages} 페이지</p>
                </div>
              </header>
              <section className="expense-resolution-print-items mt-5">
                <ExpensePrintItemsTable
                  items={items}
                  totalLabel={pageIndex === continuationPages.length - 1 ? "전체 합계" : "페이지 소계"}
                  totals={pageIndex === continuationPages.length - 1 ? { supplyAmount: resolution.supplyAmount, totalAmount: resolution.totalPaymentAmount, vatAmount: resolution.vat } : undefined}
                />
              </section>
              {pageIndex === continuationPages.length - 1 ? <ExpensePrintReasonEvidence evidenceText={evidenceText} reasonText={reasonText} resolution={resolution} warningTextClass={warningTextClass} /> : null}
              <ExpensePrintFooter page={pageIndex + 2} resolutionNo={resolution.resolutionNo} totalPages={totalPrintPages} />
            </article>
          ))}
          {evidencePrintPages.map((evidencePage, pageIndex) => {
            const documentPage = 1 + continuationPages.length + pageIndex + 1;
            return (
              <article className="erp-print-page expense-resolution-print-page expense-resolution-document-page expense-resolution-evidence-page mx-auto mt-6 rounded-sm bg-white shadow-sm" key={evidencePage.id}>
                <header className="flex items-end justify-between gap-6 border-b-2 border-[var(--color-midnight-ink)] pb-4">
                  <div className="min-w-0">
                    <h3 className="text-[22px] font-black tracking-[0.08em]">증빙자료</h3>
                    <p className="mt-1.5 truncate text-[10px] font-semibold text-[var(--color-stone)]">{resolution.resolutionNo} · {evidencePage.fileName}</p>
                  </div>
                  <p className="shrink-0 text-[10px] font-bold text-[var(--color-stone)]">{evidencePage.evidenceType} · {evidencePage.sourcePage} / {evidencePage.sourcePageCount}</p>
                </header>
                <figure className="mt-6 flex h-[205mm] items-center justify-center overflow-hidden border border-[var(--color-soft-border)] bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt={`${evidencePage.fileName} 증빙 ${evidencePage.sourcePage}페이지`} className="max-h-full max-w-full object-contain" src={evidencePage.src} />
                </figure>
                <ExpensePrintFooter page={documentPage} resolutionNo={resolution.resolutionNo} totalPages={totalPrintPages} />
              </article>
            );
          })}
        </div>

        <div className="expense-resolution-print-actions flex justify-end gap-2 border-t border-[var(--color-soft-border)] px-6 py-4">
          {displayedPrintError ? <p className="mr-auto self-center text-sm font-bold text-[var(--color-tangerine)]" role="alert">{displayedPrintError}</p> : null}
          <Button className="rounded-full" onClick={onClose} variant="outline">
            닫기
          </Button>
          <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" disabled={isPreparingPrint || isEvidencePreparing || Boolean(displayedPrintError)} onClick={() => void handleBrowserPrint()}>
            {isEvidencePreparing ? "증빙 준비 중…" : isPreparingPrint ? "출력 스타일 준비 중…" : "브라우저 프린트"}
          </Button>
        </div>
      </section>
      <article aria-hidden="true" className="erp-print-page expense-resolution-print-page expense-resolution-document-probe expense-resolution-pagination-probe" data-expense-print-page="continuation-probe" ref={continuationProbeRef}>
        <header className="border-b-2 border-[var(--color-midnight-ink)] pb-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold">세부 지출내역 (계속)</h3>
              <p className="mt-1 font-semibold">{resolution.resolutionNo} · {getResolutionSubject(resolution)}</p>
              {isBatchResolution ? <p className="mt-1 text-xs text-[var(--color-stone)]">프로젝트: {resolution.projectName || "프로젝트 미입력"}</p> : null}
            </div>
            <p className="text-xs font-semibold text-[var(--color-stone)]">측정용 페이지</p>
          </div>
        </header>
        <section className="expense-resolution-print-items mt-5">
          <ExpensePrintItemsTable items={[]} totalLabel="전체 합계" totals={{ supplyAmount: resolution.supplyAmount, totalAmount: resolution.totalPaymentAmount, vatAmount: resolution.vat }} />
        </section>
        <ExpensePrintReasonEvidence evidenceText={evidenceText} reasonText={reasonText} resolution={resolution} warningTextClass={warningTextClass} />
        <ExpensePrintFooter page={1} resolutionNo={resolution.resolutionNo} totalPages={1} />
      </article>
    </div>,
    document.body,
  );
}

type ExpensePrintItem = {
  description: string;
  expenseDate: string;
  id: string;
  itemNo: number;
  supplyAmount: string;
  taxCategory?: SingleExpenseTaxCategory;
  totalAmount: number;
  vatAmount: string;
  vendorName: string;
};

function ExpensePrintReasonEvidence({
  evidenceText,
  reasonText,
  resolution,
  warningTextClass,
}: {
  evidenceText: string;
  reasonText: string;
  resolution: ManagedExpenseResolution;
  warningTextClass: string;
}) {
  return (
    <section className="expense-resolution-print-reason expense-resolution-print-section mt-4">
      <h4 className="mb-1.5 text-[15px] font-bold">지출사유 및 증빙</h4>
      <div className="border-y border-solid border-[#9ca3af]">
        <PrintCell label="지출사유" value={<span className={`whitespace-pre-wrap ${resolution.reason.trim() ? "" : warningTextClass}`}>{reasonText}</span>} wide />
        <PrintCell label="증빙·확인근거" value={<span className={evidenceText.includes("확인 필요") || evidenceText.includes("사유 미입력") ? warningTextClass : ""}>{evidenceText}</span>} wide />
      </div>
    </section>
  );
}

function ExpenseApprovalBox({ resolution }: { resolution: ManagedExpenseResolution }) {
  const approvalLine = getDocumentApprovalParticipants(resolution);
  const needsReferenceDate = !isIsoDay(resolution.approvalPolicy?.referenceDate ?? "");
  return (
    <section aria-labelledby="expense-print-approval-heading" className="expense-resolution-print-approval min-w-0 self-end">
      <h4 className="sr-only" id="expense-print-approval-heading">결재선</h4>
      {approvalLine.length ? <table className="ml-auto w-[219px] table-fixed border-collapse text-center text-[13px]">
        <colgroup>
          <col className="w-[18px]" />
          {approvalLine.map((step) => <col className="w-[67px]" key={`approval-column-${step.name}`} />)}
        </colgroup>
        <tbody>
          <tr>
            <th className="expense-approval-vertical-label w-[18px] border border-[var(--color-midnight-ink)] p-0 align-middle font-black" rowSpan={2}>
              <span style={{ alignItems: "center", display: "inline-flex", flexDirection: "column", gap: "10px", lineHeight: 1 }}><span>결</span><span>재</span></span>
            </th>
            {approvalLine.map((step) => (
              <th className="border border-[var(--color-midnight-ink)] bg-[var(--color-cloud-veil)] py-0.5 font-bold" key={`role-${step.name}`}>{step.title}</th>
            ))}
          </tr>
          <tr>
            {approvalLine.map((step) => {
              const processedAt = formatApprovalDateTime(step.processedAt);
              return (
                <td className="h-[58px] border border-[var(--color-midnight-ink)] px-0.5 py-0.5" key={`approval-${step.name}`}>
                  <span className="block font-bold">{step.name}</span>
                  <span className="block text-[9px] font-semibold text-[var(--color-stone)]">{step.action}</span>
                  <span className="expense-approval-timestamp block text-[9px] leading-tight tabular-nums">{processedAt || step.statusLabel}</span>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table> : null}
      {needsReferenceDate ? <p className="mt-1 text-right text-[10px]">{policySummary(resolution.approvalPolicy)}</p> : null}
    </section>
  );
}

function ExpensePrintFooter({ page, resolutionNo, totalPages }: { page: number; resolutionNo: string; totalPages: number }) {
  return (
    <footer className="mt-auto flex items-end justify-between gap-6 border-t border-[var(--color-soft-border)] pt-3 text-[9px] text-[var(--color-stone)]" data-expense-print-footer>
      <div>
        <p className="text-[12px] font-bold text-[var(--color-midnight-ink)]">대방동 지역주택조합</p>
        <p className="mt-1">조합원의 소중한 자금을 투명하고 책임 있게 집행합니다.</p>
      </div>
      <p className="shrink-0 text-right">{resolutionNo} · 출력일 {getCurrentDateIso()} · {page} / {totalPages}</p>
    </footer>
  );
}

function ExpensePrintItemsTable({
  items,
  totalLabel,
  totals,
}: {
  items: ExpensePrintItem[];
  totalLabel: string;
  totals?: { supplyAmount: number; totalAmount: number; vatAmount: number };
}) {
  const pageSupplyAmount = items.reduce((sum, item) => sum + toNumber(item.supplyAmount), 0);
  const pageVatAmount = items.reduce((sum, item) => sum + toNumber(item.vatAmount), 0);
  const pageTotalAmount = items.reduce((sum, item) => sum + item.totalAmount, 0);
  return (
    <div className="overflow-x-auto border-y border-[var(--color-soft-border)] [border-bottom-style:dashed] [border-top-style:dashed]">
      <table className="w-full table-fixed border-collapse text-[12px]">
        <colgroup>
          <col className="w-[13%]" />
          <col className="w-[18%]" />
          <col className="w-[34%]" />
          <col className="w-[13%]" />
          <col className="w-[9%]" />
          <col className="w-[13%]" />
        </colgroup>
        <thead className="border-y border-solid border-[#9ca3af] bg-[var(--color-cloud-veil)]">
          <tr>
            {["지출일", "거래처", "내역", "공급가액", "부가세", "합계"].map((label) => (
              <th className="border-b border-r border-[var(--color-soft-border)] px-1 py-1 text-center text-[11px] [border-bottom-style:dashed] last:border-r-0" key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr className="expense-resolution-print-item-row text-center text-[var(--color-stone)]" key={item.id}>
              <td className="whitespace-nowrap border-b border-r border-[var(--color-soft-border)] px-1 py-1 [border-bottom-style:dashed]">{item.expenseDate || "-"}</td>
              <td className="border-b border-r border-[var(--color-soft-border)] px-1 py-1 font-semibold [border-bottom-style:dashed]">{item.vendorName || "거래처 미입력"}</td>
              <td className="whitespace-pre-wrap break-words border-b border-r border-[var(--color-soft-border)] px-1.5 py-1 text-left leading-snug [border-bottom-style:dashed]">{item.description || "-"}</td>
              <td className="whitespace-nowrap border-b border-r border-[var(--color-soft-border)] px-1 py-1 text-[11px] [border-bottom-style:dashed]">{formatExpenseResolutionAmount(toNumber(item.supplyAmount))}</td>
              <td className="whitespace-nowrap border-b border-r border-[var(--color-soft-border)] px-1 py-1 text-[11px] [border-bottom-style:dashed]">{formatExpenseResolutionAmount(toNumber(item.vatAmount))}</td>
              <td className="whitespace-nowrap border-b border-[var(--color-soft-border)] px-1 py-1 text-[11px] font-bold [border-bottom-style:dashed]">{formatExpenseResolutionAmount(item.totalAmount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-y border-solid border-[#9ca3af] bg-[var(--color-cloud-veil)] text-center font-bold">
          <tr>
            <td className="px-2 py-[4.5px]" colSpan={3}>{totalLabel}</td>
            <td className="px-2 py-[4.5px] whitespace-nowrap">{formatExpenseResolutionAmount(totals?.supplyAmount ?? pageSupplyAmount)}</td>
            <td className="px-2 py-[4.5px] whitespace-nowrap">{formatExpenseResolutionAmount(totals?.vatAmount ?? pageVatAmount)}</td>
            <td className="px-2 py-[4.5px] whitespace-nowrap">{formatExpenseResolutionAmount(totals?.totalAmount ?? pageTotalAmount)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function PrintCell({ className = "", label, value, valueClassName = "", wide }: { className?: string; label: string; value: ReactNode; valueClassName?: string; wide?: boolean }) {
  return (
    <div className={`grid min-h-[7mm] grid-cols-[26mm_1fr] border-b border-r border-[var(--color-soft-border)] last:border-r-0 ${wide ? "col-span-2 border-r-0" : ""} ${className}`}>
      <span className="flex items-center bg-[var(--color-cloud-veil)] px-2 py-1.5 text-[12px] font-bold text-[var(--color-stone)]">{label}</span>
      <span className={`flex items-center justify-center whitespace-normal px-2.5 py-1.5 text-center text-[12px] font-semibold text-[var(--color-stone)] ${valueClassName}`}>{value}</span>
    </div>
  );
}
