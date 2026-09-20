"use client";

import { useEffect, useState } from "react";

type PreviewState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; pages: string[] };

export function ReimbursementEvidencePreview({ href, title }: { href: string; title: string }) {
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(0);
  const [state, setState] = useState<PreviewState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";

    async function load() {
      try {
        const response = await fetch(href, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("첨부 증빙을 불러오지 못했어.");
        const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
        if (contentType === "application/pdf") {
          const pages = await renderPdfPages(await response.arrayBuffer());
          if (!controller.signal.aborted) { setPage(0); setState({ kind: "ready", pages }); }
          return;
        }
        if (contentType.startsWith("image/")) {
          objectUrl = URL.createObjectURL(await response.blob());
          if (!controller.signal.aborted) { setPage(0); setState({ kind: "ready", pages: [objectUrl] }); }
          return;
        }
        throw new Error("미리보기를 지원하지 않는 증빙 형식이야.");
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({ kind: "error", message: error instanceof Error ? error.message : "첨부 증빙을 불러오지 못했어." });
      }
    }

    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attempt, href]);

  if (state.kind === "loading") {
    return <div aria-live="polite" className="flex min-h-[440px] flex-1 items-center justify-center rounded-xl border bg-white p-6 text-sm text-slate-600" role="status">첨부 증빙을 선명하게 준비하고 있어.</div>;
  }
  if (state.kind === "error") {
    return <div className="flex min-h-[440px] flex-1 flex-col items-center justify-center rounded-xl border bg-white p-6 text-center" role="alert"><p className="text-sm text-slate-700">{state.message}</p><button className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" onClick={() => { setState({ kind: "loading" }); setAttempt(value => value + 1); }} type="button">다시 불러오기</button></div>;
  }

  const currentPage = Math.min(page, state.pages.length - 1);
  return <div className="flex min-h-[440px] flex-1 flex-col overflow-hidden rounded-xl border bg-slate-200/70">
    {state.pages.length > 1 ? <div aria-label="증빙 페이지 이동" className="flex items-center justify-center gap-3 border-b bg-white px-4 py-2 text-sm">
      <button className="rounded-lg border px-3 py-1.5 disabled:opacity-40" disabled={currentPage === 0} onClick={() => setPage(value => Math.max(0, value - 1))} type="button">이전</button>
      <span aria-live="polite" className="min-w-16 text-center font-semibold">{currentPage + 1} / {state.pages.length}</span>
      <button className="rounded-lg border px-3 py-1.5 disabled:opacity-40" disabled={currentPage === state.pages.length - 1} onClick={() => setPage(value => Math.min(state.pages.length - 1, value + 1))} type="button">다음</button>
    </div> : null}
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-4 sm:p-6">
      {/* Blob and PDF data URLs are generated locally after an authorized fetch, so Next image optimization cannot serve them. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={`${title} 첨부 증빙${state.pages.length > 1 ? ` ${currentPage + 1}페이지` : ""}`} className="h-auto max-h-full max-w-full rounded-sm bg-white object-contain shadow-lg ring-1 ring-slate-300" src={state.pages[currentPage]} />
    </div>
  </div>;
}

async function renderPdfPages(data: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const document = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const pdfPage = await document.getPage(pageNumber);
      const baseViewport = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: Math.min(2.2, 1200 / baseViewport.width) });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await pdfPage.render({ canvas, viewport }).promise;
      pages.push(canvas.toDataURL("image/png"));
      pdfPage.cleanup();
    }
  } finally {
    await document.destroy();
  }
  if (!pages.length) throw new Error("표시할 PDF 페이지가 없어.");
  return pages;
}
