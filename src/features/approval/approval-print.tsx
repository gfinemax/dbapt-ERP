"use client";

import { Printer, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { buildDocumentPdfFileName } from "@/features/shared/document-print-filename";
import { approvalStatusLabels, approvalTypeLabels, type ApprovalDocument } from "./approval-domain";

const stepLabels = { APPROVED: "승인", PENDING: "결재대기", REJECTED: "반려", SKIPPED: "생략", WAITING: "대기" } as const;

function date(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" }).format(new Date(value));
}

function html(value: unknown) {
  return String(value ?? "-").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function statusWatermark(document: ApprovalDocument) {
  if (document.approvalStatus === "APPROVED") return "최종 승인";
  return approvalStatusLabels[document.approvalStatus];
}

function meetingLabel(document: ApprovalDocument) {
  if (document.meetingStatus === "APPROVED") return "의결 완료";
  if (["REQUIRED", "SCHEDULED"].includes(document.meetingStatus)) return "의결 필요";
  if (document.meetingStatus === "REJECTED") return "의결 부결";
  if (document.meetingStatus === "DEFERRED") return "의결 보류";
  return "의결 대상 아님";
}

function buildPrintHtml(document: ApprovalDocument, title: string) {
  const budgetUsed = document.amount > 0 || Boolean(document.budgetItem || document.counterpartyName);
  const rows = (items: Array<[string, unknown]>) => items.map(([label, value]) => `<div class="cell"><b>${html(label)}</b><span>${html(value)}</span></div>`).join("");
  const steps = document.approvalSteps.map((step) => `<tr><td>${step.order}</td><td>${html(step.approverRole)}</td><td>${html(step.approverLabel)}</td><td>${html(stepLabels[step.status])}</td><td>${html(step.actedAt ? date(step.actedAt) : "-")}</td><td>${html(step.comment ?? "-")}</td></tr>`).join("");
  const attachments = document.attachments?.length ? document.attachments.map((file, index) => `<tr><td>${index + 1}</td><td class="left">${html(file.fileName)}</td><td>${(file.fileSize / 1024).toFixed(1)} KB</td></tr>`).join("") : `<tr><td colspan="3">첨부파일 없음</td></tr>`;
  const schedule = document.paymentSchedule?.length ? `<h2>계약·분할지급</h2><table><thead><tr><th>지급일</th><th>금액</th><th>비고</th></tr></thead><tbody>${document.paymentSchedule.map((item) => `<tr><td>${html(item.dueDate)}</td><td>${item.amount.toLocaleString("ko-KR")}원</td><td class="left">${html(item.memo)}</td></tr>`).join("")}</tbody></table>` : "";
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${html(title)}</title><style>
    @page{size:A4 portrait;margin:14mm 13mm 16mm}*{box-sizing:border-box}body{margin:0;color:#111;font-family:Pretendard,"Noto Sans KR","Malgun Gothic",sans-serif;font-size:10.5pt;line-height:1.55}.page{position:relative;max-width:184mm;margin:auto}.watermark{position:absolute;right:0;top:0;border:1px solid #777;padding:5px 12px;font-size:10pt;font-weight:700;color:#555}.draft{position:fixed;inset:42% auto auto 18%;z-index:-1;transform:rotate(-25deg);font-size:60pt;font-weight:900;color:rgba(120,120,120,.08)}h1{text-align:center;font-size:25pt;letter-spacing:.18em;margin:5mm 0 8mm}h2{font-size:13pt;margin:7mm 0 2.5mm;border-left:4px solid #222;padding-left:8px}.meta{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid #333;border-left:1px solid #333}.cell{display:grid;grid-template-columns:32mm 1fr;min-height:10mm;border-right:1px solid #333;border-bottom:1px solid #333}.cell b{display:flex;align-items:center;justify-content:center;background:#f2f3f5;border-right:1px solid #333;padding:6px}.cell span{display:flex;align-items:center;padding:6px;white-space:pre-wrap}.body{min-height:42mm;border:1px solid #333;padding:10px;white-space:pre-wrap}.purpose{min-height:14mm}table{width:100%;border-collapse:collapse;break-inside:avoid}th,td{border:1px solid #333;padding:6px;text-align:center}th{background:#f2f3f5}.left{text-align:left}.footer{margin-top:8mm;text-align:right;color:#666;font-size:9pt}@media print{.page{max-width:none}}
  </style></head><body><main class="page">${document.approvalStatus === "APPROVED" ? "" : `<div class="draft">${html(statusWatermark(document))}</div>`}<div class="watermark">${html(statusWatermark(document))}</div><h1>기 안 서</h1>
  <div class="meta">${rows([["문서번호", document.documentNo],["기안유형", approvalTypeLabels[document.documentType]],["제목", document.title],["기안일", date(document.createdAt)],["기안자", document.drafterLabel],["부서", document.departmentLabel],["시행 희망일", document.desiredExecutionDate ?? "-"],["프로젝트", document.projectName || "-"]])}</div>
  <h2>목적 및 필요성</h2><div class="body purpose">${html(document.purpose)}</div><h2>주요 내용</h2><div class="body">${html(document.body || "본문 없음")}</div>
  <h2>예산·회계정보</h2>${budgetUsed ? `<div class="meta">${rows([["총금액", `${document.amount.toLocaleString("ko-KR")}원`],["예산 항목", document.budgetItem ?? "미지정"],["거래처", document.counterpartyName ?? "미지정"],["예산 외 지출", document.isOutOfBudget ? "예" : "아니오"],["지급 예정일", document.paymentDueDate ?? "-"],["증빙 종류", document.evidenceKind ?? "-"]])}</div>` : `<div class="body purpose">예산·회계정보 없음</div>`}
  <h2>의결정보</h2><div class="meta">${rows([["의결 상태", meetingLabel(document)],["권고 의결기관", document.recommendedMeetingBody ?? "-"],["규정 근거", document.regulationReference ?? "-"],["권고 사유", document.recommendationReason ?? "-"]])}</div>
  ${schedule}<h2>결재선</h2><table><thead><tr><th>순서</th><th>직책</th><th>성명</th><th>상태</th><th>처리일</th><th>의견</th></tr></thead><tbody>${steps}</tbody></table>
  <h2>첨부파일</h2><table><thead><tr><th>순번</th><th>파일명</th><th>크기</th></tr></thead><tbody>${attachments}</tbody></table><p class="footer">출력일 ${html(date(new Date().toISOString()))}</p></main></body></html>`;
}

export function ApprovalPrint({ document }: { document: ApprovalDocument }) {
  const [open, setOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const fileName = buildDocumentPdfFileName(document.documentNo, document.title, "기안서");
  const printTitle = fileName.replace(/\.pdf$/i, "");

  async function print() {
    setPrinting(true);
    const originalTitle = window.document.title;
    window.document.title = printTitle;
    const frame = window.document.createElement("iframe");
    Object.assign(frame.style, { border: "0", bottom: "0", height: "1px", opacity: "0", position: "fixed", right: "0", width: "1px" });
    window.document.body.appendChild(frame);
    let restored = false;
    let restoreTimer: number | undefined;
    const restore = () => {
      if (restored) return;
      restored = true;
      if (restoreTimer) window.clearTimeout(restoreTimer);
      window.document.title = originalTitle;
      frame.remove();
      setPrinting(false);
    };
    try {
      if (!frame.contentDocument || !frame.contentWindow) throw new Error("인쇄 창을 만들지 못했어.");
      frame.contentDocument.open();
      frame.contentDocument.write(buildPrintHtml(document, printTitle));
      frame.contentDocument.close();
      await new Promise<void>((resolve) => window.setTimeout(resolve, 150));
      frame.contentWindow.addEventListener("afterprint", restore, { once: true });
      frame.contentWindow.focus();
      frame.contentWindow.print();
      restoreTimer = window.setTimeout(restore, 60_000);
    } catch { restore(); }
  }

  return <>
    <button className="inline-flex items-center gap-2 rounded-full bg-[var(--color-pressed-charcoal)] px-4 py-2 text-sm font-bold text-white" onClick={() => setOpen(true)} type="button"><Printer size={16} />인쇄하기</button>
    {open ? createPortal(<div aria-label="기안서 A4 출력 미리보기" aria-modal="true" className="fixed inset-0 z-[70] overflow-y-auto bg-black/55 p-4" role="dialog">
      <div className="mx-auto max-w-[900px] overflow-hidden rounded-2xl bg-white shadow-2xl"><header className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="text-xl font-bold">A4 출력 미리보기</h2><p className="mt-1 text-xs text-[var(--color-stone)]">{fileName}</p></div><button aria-label="닫기" onClick={() => setOpen(false)} type="button"><X /></button></header>
        <div className="bg-[var(--color-cloud-veil)] p-4 sm:p-8"><article className="mx-auto min-h-[1120px] max-w-[794px] bg-white p-8 text-sm shadow"><div className="flex justify-end"><span className="border px-3 py-1 font-bold">{statusWatermark(document)}</span></div><h1 className="my-6 text-center text-3xl font-black tracking-[.25em]">기 안 서</h1><div className="grid grid-cols-2 border-l border-t">{[["문서번호",document.documentNo],["유형",approvalTypeLabels[document.documentType]],["제목",document.title],["기안일",date(document.createdAt)],["기안자",document.drafterLabel],["부서",document.departmentLabel]].map(([label,value])=><div className="grid grid-cols-[110px_1fr] border-b border-r" key={label}><b className="bg-gray-100 p-2 text-center">{label}</b><span className="p-2">{value}</span></div>)}</div><h2 className="mb-2 mt-6 text-lg font-bold">목적 및 필요성</h2><p className="min-h-16 whitespace-pre-wrap border p-3">{document.purpose}</p><h2 className="mb-2 mt-6 text-lg font-bold">주요 내용</h2><p className="min-h-40 whitespace-pre-wrap border p-3">{document.body || "본문 없음"}</p><h2 className="mb-2 mt-6 text-lg font-bold">결재선</h2><div className="grid gap-2">{document.approvalSteps.map(step=><p className="border p-2" key={step.order}>{step.order}. {step.approverRole} {step.approverLabel} · {stepLabels[step.status]}</p>)}</div></article></div>
        <footer className="flex justify-end gap-2 border-t px-5 py-4"><button className="rounded-full border px-5 py-2 text-sm font-bold" onClick={() => setOpen(false)} type="button">닫기</button><button className="rounded-full bg-[var(--color-deep-cobalt)] px-5 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={printing} onClick={() => void print()} type="button">{printing ? "인쇄 준비 중" : "인쇄 / PDF 저장"}</button></footer></div>
    </div>, window.document.body) : null}
  </>;
}
