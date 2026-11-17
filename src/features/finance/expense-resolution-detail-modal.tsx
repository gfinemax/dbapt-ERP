"use client";

import { ChevronDown, ChevronRight, MoreHorizontal, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { ReactNode } from "react";
import { Fragment, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ApprovalDocumentCandidate } from "@/features/approval/approval-domain";
import { policySummary } from "./expense-approval-period";
import type { ExpenseFactConfirmation, ExpenseFactConfirmationInput } from "./expense-compliance-repository";
import { formatExpenseResolutionAmount } from "./expense-resolution-data";
import { normalizeExpenseTiming } from "./expense-resolution-domain";
import { getResolutionAccountTitle } from "./expense-resolution-display";
import { isLegacySmallExpenseResolution } from "./legacy-small-expense";
import {
  Badge,
  formatHistoryActor,
  getBudgetOverLabel,
  getDisplayApprovalLine,
  getDocumentApprovalParticipants,
  getEvidenceRows,
  getExpenseAuthorizationReadiness,
  getExpenseTimingLabel,
  getHistoryTone,
  getRelatedVoucherNo,
  getResolutionSubject,
  getResolutionTaxCategorySummary,
  getResolutionTypeFullLabel,
  getVoucherStatusLabel,
  toNumber,
  type ApprovalStep,
  type BatchExpenseItem,
  type ExpenseResolutionHistoryItem,
  type ManagedExpenseResolution,
} from "./expense-resolution-page";

const ExpenseBudgetInspector = dynamic(
  () => import("./expense-budget-inspector").then((module) => module.ExpenseBudgetInspector),
  { ssr: false },
);

export function ExpenseFactConfirmationModal({ actorLabel, deleteConfirmation, detailItem, listConfirmations, onClose, onSave, onUploadSupportingFile, resolution }: { actorLabel: string; deleteConfirmation?: (id: string, resolutionId: string, actorLabel: string) => Promise<void>; detailItem?: BatchExpenseItem; listConfirmations?: (resolutionId: string) => Promise<ExpenseFactConfirmation[]>; onClose: () => void; onSave?: (input: ExpenseFactConfirmationInput) => Promise<string>; onUploadSupportingFile?: (formData: FormData) => Promise<{ fileName: string; id: string }>; resolution: ManagedExpenseResolution }) {
  const [form, setForm] = useState<ExpenseFactConfirmationInput>({
    actualExpenseDate: detailItem?.expenseDate ?? resolution.actualExpenseDate ?? resolution.createdAt,
    actualSpender: detailItem?.actualSpender || resolution.advancePayer || resolution.author,
    amount: detailItem?.totalAmount ?? resolution.totalPaymentAmount,
    authorLabel: actorLabel,
    businessPurpose: detailItem?.businessPurpose || resolution.reason,
    detailTransactionId: detailItem?.id,
    itemDescription: detailItem?.itemTitle || resolution.subject || resolution.operationExpenseDetail,
    missingReceiptReason: "",
    paymentMethod: detailItem?.paymentMethod ?? resolution.advancePaymentMethod ?? resolution.paymentMethod ?? "개인 현금",
    resolutionId: resolution.id,
    vendorName: detailItem?.vendorName || resolution.vendorName,
  });
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState("");
  const factSaving = useRef(false);
  const [isFactSaving, setIsFactSaving] = useState(false);
  const [supportingFiles, setSupportingFiles] = useState<string[]>([]);
  const [confirmations, setConfirmations] = useState<ExpenseFactConfirmation[]>([]);
  useEffect(() => { if (listConfirmations) void listConfirmations(resolution.id).then(setConfirmations).catch(() => setConfirmations([])); }, [listConfirmations, resolution.id]);
  const update = <K extends keyof ExpenseFactConfirmationInput>(key: K, value: ExpenseFactConfirmationInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  async function save() {
    if (!onSave) { setError("지출사실확인서 저장소가 연결되지 않았습니다."); return; }
    if (factSaving.current) return;
    factSaving.current = true; setIsFactSaving(true);
    try { setError(""); const id = await onSave(form); setSavedId(id); setForm((current) => ({ ...current, id })); if (listConfirmations) setConfirmations(await listConfirmations(resolution.id)); } catch (caught) { setError(caught instanceof Error ? caught.message : "저장하지 못했습니다."); } finally { factSaving.current = false; setIsFactSaving(false); }
  }
  async function uploadSupportingFile(file?: File) {
    if (!file || !savedId || !onUploadSupportingFile) { setError("확인서를 먼저 저장한 후 보완자료를 첨부해주세요."); return; }
    const data = new FormData(); data.set("file", file); data.set("factConfirmationId", savedId); data.set("resolutionId", resolution.id);
    try { const result = await onUploadSupportingFile(data); setSupportingFiles((current) => [...current, result.fileName]); setError(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "보완자료를 저장하지 못했습니다."); }
  }
  function editConfirmation(item: ExpenseFactConfirmation) { setForm({ ...item, authorLabel: actorLabel }); setSavedId(item.id); setSupportingFiles([]); }
  async function removeConfirmation(item: ExpenseFactConfirmation) { if (!deleteConfirmation || !window.confirm("지출사실확인서를 삭제할까요? 이전 이력은 감사로그에 보존됩니다.")) return; try { await deleteConfirmation(item.id, resolution.id, actorLabel); setConfirmations((current) => current.filter((entry) => entry.id !== item.id)); if (savedId === item.id) setSavedId(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "삭제하지 못했습니다."); } }
  return <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/45 p-6 print:static print:bg-white print:p-0" onClick={onClose}>
    <section aria-label="지출사실확인서" className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl print:max-w-none print:rounded-none print:shadow-none" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between border-b px-6 py-4 print:hidden"><div><h2 className="text-xl font-bold">지출사실확인서 작성</h2><p className="mt-1 text-sm text-[var(--color-stone)]">지출결의서 {resolution.resolutionNo}{detailItem ? ` · 상세거래 ${detailItem.itemNo}` : ""}의 보완자료이며 독립 지급·전표 문서가 아닙니다.</p></div><Button onClick={onClose} variant="outline">닫기</Button></div>
      {confirmations.length ? <div className="mx-6 mt-4 grid gap-2 print:hidden">{confirmations.map((item) => <div className="flex items-center justify-between rounded-lg border bg-gray-50 px-4 py-2 text-sm" key={item.id}><span className="font-bold">{item.vendorName} · {item.amount.toLocaleString("ko-KR")}원 · revision {item.revisionNo}</span><span className="flex gap-2"><Button onClick={() => editConfirmation(item)} size="sm" variant="outline">수정</Button><Button onClick={() => void removeConfirmation(item)} size="sm" variant="outline">삭제</Button></span></div>)}</div> : null}
      <div className="m-6 min-h-[257mm] border-2 border-black p-10 print:m-0 print:min-h-[297mm] print:border-0">
        <h1 className="text-center text-3xl font-bold tracking-[0.35em]">지출사실확인서</h1>
        <p className="mt-3 text-center text-sm">연결 결의번호: {resolution.resolutionNo}</p>
        <div className="mt-10 grid grid-cols-2 gap-4 print:gap-2">
          <FactField label="실제 지출자" value={form.actualSpender} onChange={(value) => update("actualSpender", value)} />
          <FactField label="실제 지출일" type="date" value={form.actualExpenseDate} onChange={(value) => update("actualExpenseDate", value)} />
          <FactField label="구입처" value={form.vendorName} onChange={(value) => update("vendorName", value)} />
          <FactField label="지출금액" type="number" value={String(form.amount)} onChange={(value) => update("amount", Number(value))} />
          <FactField className="col-span-2" label="구입 품목 또는 서비스" value={form.itemDescription} onChange={(value) => update("itemDescription", value)} />
          <FactField className="col-span-2" label="지출 목적 및 조합 업무 관련성" value={form.businessPurpose} onChange={(value) => update("businessPurpose", value)} />
          <FactField className="col-span-2" label="영수증 미첨부 사유" value={form.missingReceiptReason} onChange={(value) => update("missingReceiptReason", value)} />
          <FactField label="결제수단" value={form.paymentMethod} onChange={(value) => update("paymentMethod", value)} />
          <div className="rounded-lg border p-3 text-sm"><span className="block text-xs font-bold text-gray-500">작성자 · 로그인 계정</span>{form.authorLabel}</div>
          <div className="rounded-lg border p-3 text-sm"><span className="block text-xs font-bold text-gray-500">사실 확인자</span>{form.confirmerLabel || "확인 권한 정책 설정 후 서명 가능"}</div>
          <div className="rounded-lg border p-3 text-sm"><span className="block text-xs font-bold text-gray-500">전자 확인기록</span>{savedId ? `저장 ID ${savedId}` : "저장 후 생성"}</div>
          <label className="col-span-2 grid gap-2 rounded-lg border p-3 text-sm font-bold print:hidden"><span>보완자료</span><input disabled={!savedId} onChange={(event) => void uploadSupportingFile(event.target.files?.[0])} type="file" />{supportingFiles.length ? <span className="text-xs text-green-700">{supportingFiles.join(", ")}</span> : <span className="text-xs text-gray-500">확인서를 저장한 뒤 사진·이체내역 등 보완자료를 첨부할 수 있습니다.</span>}</label>
        </div>
        <p className="mt-10 text-sm leading-7">위 지출은 조합 업무 수행 과정에서 실제 발생하였으며, 영수증을 첨부하지 못한 사유와 기재 내용이 사실임을 확인합니다.</p>
        <div className="mt-16 flex justify-end gap-12 text-sm"><p>작성자: {form.authorLabel} (서명)</p><p>확인자: {form.confirmerLabel || "____________"} (서명)</p></div>
      </div>
      <div className="flex justify-between border-t px-6 py-4 print:hidden"><p className="text-sm font-bold text-amber-800">저장 후에도 증빙상태는 대체증빙 또는 증빙불비로 유지됩니다.</p><div className="flex gap-2"><Button onClick={() => window.print()} variant="outline">A4 인쇄·PDF</Button><Button disabled={isFactSaving} onClick={() => void save()}>{isFactSaving ? "저장 중" : savedId ? "수정 저장" : "확인서 초안 저장"}</Button></div></div>
      {error ? <p className="mx-6 mb-4 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700 print:hidden">{error}</p> : null}
    </section>
  </div>;
}

function FactField({ className = "", label, onChange, type = "text", value }: { className?: string; label: string; onChange: (value: string) => void; type?: "date" | "number" | "text"; value: string }) {
  return <label className={`grid gap-1 rounded-lg border p-3 ${className}`}><span className="text-xs font-bold text-gray-500">{label}</span><input className="border-0 bg-transparent font-semibold outline-none print:appearance-none" onChange={(event) => onChange(event.target.value)} type={type} value={value} /></label>;
}

type ExpenseDetailView = "evidence" | "history" | "overview" | "expenses";
const compactExpenseDetailLayoutEnabled = true;

function ExpenseApprovalFlowStrip({ approvalLine, resolution }: { approvalLine: ApprovalStep[]; resolution: ManagedExpenseResolution }) {
  const approvalComplete = resolution.approvalStatus === "승인완료";
  const paymentComplete = resolution.paymentStatus === "지급완료";
  const voucherComplete = resolution.voucherStatus === "전표확정";
  const steps = [
    { complete: true, current: resolution.approvalStatus === "작성중", label: "작성 완료" },
    ...approvalLine.map((step) => ({
      complete: step.status === "승인완료",
      current: step.status === "결재대기",
      label: `${step.approver} ${step.status}`,
    })),
    { complete: paymentComplete, current: approvalComplete && !paymentComplete, label: "지급" },
    { complete: voucherComplete, current: paymentComplete && !voucherComplete, label: "전표" },
  ];

  return (
    <ol aria-label="결의 진행 단계" className="flex min-w-max items-center gap-1 px-5 py-2.5">
      {steps.map((step, index) => (
        <li className="flex items-center gap-1" key={`${step.label}-${index}`}>
          <span className={`inline-flex h-9 items-center rounded-full border px-3 text-xs font-bold ${
            step.current
              ? "border-blue-200 bg-blue-100 text-blue-900"
              : step.complete
                ? "border-[var(--color-pressed-charcoal)] bg-[var(--color-pressed-charcoal)] text-white"
                : "border-[var(--color-soft-border)] bg-white text-[var(--color-stone)]"
          }`}>
            {step.label}
          </span>
          {index < steps.length - 1 ? <ChevronRight aria-hidden="true" className="size-4 text-[var(--color-fog)]" /> : null}
        </li>
      ))}
    </ol>
  );
}

function ExpenseResolutionDetailWorkspace({
  actionError,
  approvalLine,
  budgetDataError,
  canApprove,
  evidenceRows,
  isCorporateCardPayment,
  isApprovalActionPending,
  linkedApproval,
  onApprove,
  onConfirmVoucher,
  onCreateFactConfirmation,
  onCreateVoucher,
  onProcessPayment,
  onReject,
  onRequestApproval,
  resolution,
  timelineItems,
  transferReceiptAttached,
}: {
  actionError?: string;
  approvalLine: ApprovalStep[];
  budgetDataError?: string;
  canApprove: boolean;
  evidenceRows: ReturnType<typeof getEvidenceRows>;
  isCorporateCardPayment: boolean;
  isApprovalActionPending: boolean;
  linkedApproval?: ApprovalDocumentCandidate;
  onApprove: () => void;
  onConfirmVoucher?: () => void;
  onCreateFactConfirmation?: (detailItem?: BatchExpenseItem) => void;
  onCreateVoucher?: () => void;
  onProcessPayment?: () => void;
  onReject: () => void;
  onRequestApproval: () => void;
  resolution: ManagedExpenseResolution;
  timelineItems: ExpenseResolutionHistoryItem[];
  transferReceiptAttached: string;
}) {
  const [activeView, setActiveView] = useState<ExpenseDetailView>("overview");
  const [expandedItemId, setExpandedItemId] = useState<string>();
  const expenseItems = resolution.resolutionType === "BATCH" ? resolution.expenseItems : [];
  const isMultipleExpense = expenseItems.length > 1;
  const itemCount = isMultipleExpense ? expenseItems.length : 1;
  const budget = resolution.budgetSnapshot;
  const budgetLinked = budget.monthlyBudgetAmount > 0 || budget.currentAnnualBudgetAmount > 0;
  const authorization = getExpenseAuthorizationReadiness(resolution);
  const documentApprovalParticipants = getDocumentApprovalParticipants(resolution);
  const usageRate = Number.isFinite(budget.budgetUsageRate) ? Math.max(0, budget.budgetUsageRate) : 0;
  const hasRelatedInformation = Boolean(resolution.relatedContract || resolution.relatedMeeting || resolution.voucherNo);
  const nextAction = resolution.approvalStatus !== "승인완료"
    ? undefined
    : resolution.paymentStatus !== "지급완료" && onProcessPayment
      ? { label: "지급처리", onClick: onProcessPayment }
      : !resolution.voucherNo && onCreateVoucher
        ? { label: "전표초안 생성", onClick: onCreateVoucher }
        : resolution.voucherStatus === "전표초안" && onConfirmVoucher
          ? { label: "전표확정", onClick: onConfirmVoucher }
          : undefined;

  const viewOptions: Array<{ label: string; value: ExpenseDetailView }> = [
    { label: "전체요약", value: "overview" },
    { label: `지출 ${itemCount}건`, value: "expenses" },
    { label: `증빙 ${evidenceRows.length}건`, value: "evidence" },
    { label: `이력 ${timelineItems.length}건`, value: "history" },
  ];

  return (
    <div className="grid min-h-0 flex-1 bg-[var(--color-sky-wash)]/35 xl:grid-cols-[minmax(0,1fr)_360px]">
      <main className="min-h-0 overflow-y-auto p-4 xl:overflow-hidden">
        <nav aria-label="지출결의서 상세 보기" className="flex flex-wrap gap-2">
          {viewOptions.map((option) => (
            <button
              aria-pressed={activeView === option.value}
              className={`rounded-full border px-4 py-2 text-sm font-bold ${activeView === option.value ? "border-[var(--color-pressed-charcoal)] bg-[var(--color-pressed-charcoal)] text-white" : "border-[var(--color-soft-border)] bg-white text-[var(--color-stone)]"}`}
              key={option.value}
              onClick={() => setActiveView(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </nav>

        {isLegacySmallExpenseResolution(resolution) ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <strong>기존 소액 일괄결의 · 조회 전용</strong>
            <span className="ml-2">기존 승인·지급 이력 확인과 출력만 가능합니다.</span>
          </div>
        ) : null}

        {activeView === "overview" || activeView === "expenses" ? (
          <>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-y border-[var(--color-soft-border)] bg-white/80 px-3 py-2 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-black text-[var(--color-midnight-ink)]">지출 형태</span>
                <span className={`rounded-full px-3 py-1 font-bold ${!isMultipleExpense ? "bg-[var(--color-pressed-charcoal)] text-white" : "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]"}`}>단일 지출</span>
                <span className={`rounded-full px-3 py-1 font-bold ${isMultipleExpense ? "bg-[var(--color-pressed-charcoal)] text-white" : "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]"}`}>다건 지출</span>
              </div>
              <p className="font-semibold text-[var(--color-stone)]">{isMultipleExpense ? `${itemCount}개 지출을 하나의 결의서로 검토합니다.` : "한 건의 핵심 지출정보를 우선 표시합니다."}</p>
            </div>

            {activeView === "overview" ? (
              <dl className="mt-3 grid grid-cols-2 overflow-hidden rounded-xl border border-blue-100 bg-blue-50/80 text-sm sm:grid-cols-3 lg:grid-cols-5">
                <CompactMetric label="지출" value={`${itemCount}건`} />
                <CompactMetric label="월 예산" value={budgetDataError ? "확인" : budgetLinked ? formatExpenseResolutionAmount(budget.monthlyBudgetAmount) : "연결 필요"} />
                <CompactMetric label="이번 결의" value={formatExpenseResolutionAmount(resolution.totalPaymentAmount)} />
                <CompactMetric label="월 예상 잔액" value={budgetDataError ? "확인 필요" : budgetLinked ? formatExpenseResolutionAmount(budget.remainingBudgetAmount) : "확인 필요"} />
                <CompactMetric label="집행률" value={!budgetDataError && budgetLinked ? `${usageRate}%` : "-"} />
              </dl>
            ) : null}

            <section className="mt-3" aria-labelledby="expense-detail-workspace-title">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-base font-black" id="expense-detail-workspace-title">지출내역 <span className="text-sm text-[var(--color-stone)]">({itemCount}건)</span></h3>
                {onCreateFactConfirmation ? <button className="text-xs font-bold text-[var(--color-deep-cobalt)] underline" onClick={() => onCreateFactConfirmation()} type="button">지출사실확인서 작성</button> : null}
              </div>
              {isMultipleExpense ? (
                <div className="overflow-hidden rounded-xl border border-[var(--color-soft-border)] bg-white">
                  <table className="w-full table-fixed text-left text-xs">
                    <thead className="bg-[var(--color-cloud-veil)] text-[var(--color-stone)]">
                      <tr>
                        <th className="w-8 px-2 py-2"><span className="sr-only">상세</span></th>
                        <th className="w-10 px-2 py-2 text-center">No.</th>
                        <th className="w-24 px-2 py-2">날짜</th>
                        <th className="w-24 px-2 py-2">거래처</th>
                        <th className="px-2 py-2">지출내용</th>
                        <th className="w-[24%] px-2 py-2">예산귀속</th>
                        <th className="w-28 px-2 py-2 text-right">금액</th>
                        <th className="w-16 px-2 py-2 text-center">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-soft-border)]">
                      {expenseItems.map((item) => {
                        const expanded = expandedItemId === item.id;
                        return (
                          <Fragment key={item.id}>
                            <tr className={item.budgetStatus === "OVER_BUDGET" ? "bg-[var(--color-sunset-soft)]/25" : "bg-white"}>
                              <td className="px-2 py-1.5"><button aria-expanded={expanded} aria-label={`${item.itemNo}번 지출 상세 ${expanded ? "접기" : "펼치기"}`} className="rounded p-1 hover:bg-[var(--color-cloud-veil)]" onClick={() => setExpandedItemId(expanded ? undefined : item.id)} type="button"><ChevronRight className={`size-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} /></button></td>
                              <td className="px-2 py-1.5 text-center font-bold">{item.itemNo}</td>
                              <td className="px-2 py-1.5 text-[var(--color-stone)]">{item.expenseDate || "-"}</td>
                              <td className="truncate px-2 py-1.5 font-bold">{item.vendorName || "거래처 미입력"}</td>
                              <td className="px-2 py-1.5"><p className="truncate font-semibold">{item.itemTitle || resolution.reason}</p><p className="truncate text-[11px] text-[var(--color-stone)]">{item.businessPurpose || resolution.reason}</p></td>
                              <td className="px-2 py-1.5"><p className="truncate font-semibold">{item.budgetItem || resolution.budgetItem}</p><p className="truncate text-[11px] text-[var(--color-stone)]">{item.accountTitle}</p></td>
                              <td className="px-2 py-1.5 text-right"><p className="font-black">{formatExpenseResolutionAmount(item.totalAmount)}</p><p className="text-[11px] text-[var(--color-stone)]">세액 {formatExpenseResolutionAmount(toNumber(item.vatAmount))}</p></td>
                              <td className="px-2 py-1.5 text-center"><Badge value={item.budgetStatus === "OVER_BUDGET" ? "예산초과" : "정상"} /></td>
                            </tr>
                            {expanded ? (
                              <tr className="bg-[var(--color-cloud-veil)]/45">
                                <td colSpan={8} className="px-4 py-3">
                                  <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                                    <InlineFact label="실제 지출자" value={item.actualSpender || resolution.author} />
                                    <InlineFact label="증빙" value={item.evidenceFileName || item.evidenceType || "미첨부"} />
                                    <InlineFact label="지급상태" value={item.paymentStatus} />
                                    <InlineFact label="전표번호" value={item.voucherNo ?? "미생성"} />
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-[var(--color-soft-border)] bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-soft-border)] pb-4">
                    <div><p className="text-xs font-bold text-[var(--color-stone)]">거래처 · 지출구분</p><p className="mt-1 text-xl font-black">{resolution.vendorName || "거래처 미입력"}</p><p className="mt-1 text-sm text-[var(--color-stone)]">{resolution.expenseType}</p></div>
                    <div className="text-right"><p className="text-xs font-bold text-[var(--color-stone)]">총 결의금액</p><p className="mt-1 text-2xl font-black">{formatExpenseResolutionAmount(resolution.totalPaymentAmount)}</p><Badge value={resolution.budgetSnapshot.budgetCheckStatus} /></div>
                  </div>
                  <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                    <InlineFact label="지출내용" value={getResolutionSubject(resolution)} />
                    <InlineFact label="계정과목" value={getResolutionAccountTitle(resolution)} />
                    <InlineFact label="예산귀속" value={resolution.budgetItem || "미지정"} />
                    <InlineFact label="공급가액 / 부가세" value={`${formatExpenseResolutionAmount(resolution.supplyAmount)} / ${formatExpenseResolutionAmount(resolution.vat)}`} />
                    <InlineFact label="지출예정일" value={resolution.plannedPaymentDate || "미정"} />
                    <InlineFact label="업무목적" value={resolution.reason || "미입력"} />
                    <InlineFact label="증빙" value={evidenceRows.length ? `${evidenceRows.length}건 첨부` : "미첨부"} />
                  </dl>
                </div>
              )}
            </section>
          </>
        ) : null}

        {activeView === "evidence" ? (
          <section className="mt-4" aria-labelledby="expense-evidence-view-title">
            <h3 className="text-base font-black" id="expense-evidence-view-title">증빙자료 <span className="text-sm text-[var(--color-stone)]">({evidenceRows.length}건)</span></h3>
            <div className="mt-3 overflow-hidden rounded-xl border border-[var(--color-soft-border)] bg-white">
              {evidenceRows.length ? evidenceRows.map((evidence) => <div className="grid gap-2 border-b border-[var(--color-soft-border)] px-4 py-3 text-sm last:border-b-0 sm:grid-cols-[90px_1fr_110px]" key={`${evidence.evidenceType}-${evidence.fileName}`}><strong>{evidence.evidenceType}</strong><span className="truncate text-[var(--color-stone)]">{evidence.fileName}</span><span className="text-right font-bold">{formatExpenseResolutionAmount(evidence.amount)}</span></div>) : <p className="p-6 text-center text-sm text-[var(--color-stone)]">첨부된 증빙이 없습니다.</p>}
            </div>
          </section>
        ) : null}

        {activeView === "history" ? (
          <section className="mt-4" aria-labelledby="expense-history-view-title">
            <h3 className="text-base font-black" id="expense-history-view-title">처리이력 <span className="text-sm text-[var(--color-stone)]">({timelineItems.length}건)</span></h3>
            <ol className="mt-3 grid gap-2">
              {timelineItems.length ? timelineItems.map((item) => <li className="grid gap-2 rounded-xl border border-[var(--color-soft-border)] bg-white px-4 py-3 text-sm sm:grid-cols-[145px_1fr]" key={item.id}><time className="font-semibold text-[var(--color-stone)]">{item.actionAt}</time><div><p className="font-bold">{formatHistoryActor(item)} · {item.actionLabel}</p>{item.comment ? <p className="mt-1 text-[var(--color-stone)]">{item.comment}</p> : null}</div></li>) : <li className="rounded-xl border border-[var(--color-soft-border)] bg-white p-6 text-center text-sm text-[var(--color-stone)]">아직 처리이력이 없습니다.</li>}
            </ol>
          </section>
        ) : null}
      </main>

      <aside className="min-h-0 overflow-y-auto border-t border-[var(--color-soft-border)] bg-white p-4 xl:border-t-0 xl:border-l" aria-label="결재 및 예산 판단">
        {nextAction ? (
          <section aria-labelledby="expense-next-action-title" className="sticky top-0 z-10 mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3 shadow-sm">
            <h3 className="text-base font-black text-blue-950" id="expense-next-action-title">다음 할 일</h3>
            <p className="mt-1 text-xs font-semibold text-blue-900">상단 단계는 상태 표시야.</p>
            <Button className="mt-3 w-full rounded-lg bg-[var(--color-pressed-charcoal)] text-white hover:bg-[var(--color-midnight-ink)]" onClick={nextAction.onClick}>{nextAction.label}</Button>
          </section>
        ) : null}
        <section aria-labelledby="approval-inspector-title">
          <h3 className="text-base font-black" id="approval-inspector-title">결재 진행</h3>
          {resolution.approvalParticipants?.length ? (
            <div className="mt-3 rounded-xl border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)]/45 p-3">
              <p className="text-xs font-black text-[var(--color-stone)]">문서 표시 · 3명</p>
              <ol className="mt-2 grid gap-2">
                {documentApprovalParticipants.map((participant) => (
                  <li className="grid grid-cols-[1fr_auto] items-center gap-2 text-xs" key={participant.name}>
                    <span><strong className="text-sm">{participant.name}</strong><span className="ml-1 text-[var(--color-stone)]">{participant.title}</span></span>
                    <span className="rounded-full border border-[var(--color-soft-border)] bg-white px-2 py-1 font-bold">{participant.action} · {participant.statusLabel}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-[11px] leading-4 text-[var(--color-stone)]">생략·작성·후열 표시는 승인 서명으로 계산하지 않아.</p>
            </div>
          ) : null}
          <p className="mt-3 text-xs font-black text-[var(--color-stone)]">실제 로그인 결재 · {approvalLine.length}명</p>
          <ol className="mt-3 grid gap-2">
            {approvalLine.map((step, index) => (
              <li className="grid grid-cols-[24px_1fr_auto] items-center gap-2 text-sm" key={step.order}>
                <span className={`flex size-5 items-center justify-center rounded-full border-2 text-[10px] font-black ${step.status === "결재대기" ? "border-[var(--color-deep-cobalt)] text-[var(--color-deep-cobalt)]" : step.status === "승인완료" ? "border-green-600 bg-green-600 text-white" : "border-[var(--color-soft-border)] text-[var(--color-stone)]"}`}>{index + 1}</span>
                <span><strong>{step.approver}</strong><span className="ml-2 text-xs text-[var(--color-stone)]">{step.role}</span></span>
                <Badge value={step.status} />
              </li>
            ))}
          </ol>
          <div className="mt-3 rounded-lg border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)]/55 p-3">
            {resolution.approvalStatus === "작성중" ? (
              authorization.ready ? (
                <Button className="w-full rounded-lg bg-[var(--color-pressed-charcoal)] text-white hover:bg-[var(--color-midnight-ink)]" disabled={isApprovalActionPending} onClick={onRequestApproval}>
                  {isApprovalActionPending ? "승인요청 처리 중" : "결재 시작 · 승인요청"}
                </Button>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                  <p className="font-black">승인요청 전 계정 연결이 필요합니다.</p>
                  <p className="mt-1 font-semibold">작성자 {authorization.authorLinked ? "연결됨" : "미연결"} · 결재자 {authorization.linkedApproverCount}/{authorization.expectedApproverCount}명</p>
                  <p className="mt-1">결재자 로그인 계정을 등록한 뒤 각 결재 순서에 연결해 주세요.</p>
                  <Link className="mt-2 inline-flex rounded-md border border-amber-300 bg-white px-2.5 py-1 font-black text-amber-950 hover:bg-amber-100" href={`/finance/expense-authorizations?id=${encodeURIComponent(resolution.id)}`}>계정 연결 화면 열기</Link>
                </div>
              )
            ) : null}
            {resolution.approvalStatus === "승인대기" && canApprove ? (
              <div className="grid grid-cols-2 gap-2">
                <Button className="rounded-lg bg-[var(--color-pressed-charcoal)] text-white hover:bg-[var(--color-midnight-ink)]" disabled={isApprovalActionPending} onClick={onApprove}>{isApprovalActionPending ? "처리 중" : "승인"}</Button>
                <Button className="rounded-lg text-[var(--color-tangerine)]" disabled={isApprovalActionPending} onClick={onReject} variant="outline">반려</Button>
              </div>
            ) : null}
            {resolution.approvalStatus === "승인대기" && !canApprove ? (
              <p className="text-xs font-semibold leading-5 text-[var(--color-stone)]">현재 결재자는 <strong className="text-[var(--color-midnight-ink)]">{resolution.currentApprover ?? approvalLine.find((step) => step.status === "결재대기")?.approver ?? "지정 결재자"}</strong>입니다. 해당 결재자 계정에서 승인·반려할 수 있습니다.</p>
            ) : null}
            {resolution.approvalStatus === "승인완료" ? <p className="text-xs font-bold text-[var(--color-green-ink)]">{resolution.paymentStatus === "지급완료" ? "모든 결재와 지급이 완료됐어. 전표 단계로 진행해." : "모든 결재가 완료됐어. 지급 단계로 진행해."}</p> : null}
            {actionError ? <p role="alert" className="mt-2 rounded-md bg-red-50 px-2.5 py-2 text-xs font-bold text-red-700">{actionError}</p> : null}
          </div>
        </section>

        <ExpenseBudgetInspector approvalDocumentId={resolution.approvalDocumentId} approvalDocumentNo={resolution.approvalDocumentNo} budget={budget} budgetDataError={budgetDataError} budgetItem={resolution.budgetItem} budgetOverReason={resolution.budgetOverReason} linkedApproval={linkedApproval} />

        <section className="mt-4 border-t border-[var(--color-soft-border)] pt-4" aria-labelledby="payment-inspector-title">
          <h3 className="text-base font-black" id="payment-inspector-title">지급 · 증빙</h3>
          <dl className="mt-3 grid gap-2 text-sm">
            <InspectorRow label="지급상태" value={resolution.paymentStatus} />
            <InspectorRow label="지급예정" value={resolution.plannedPaymentDate || "미정"} />
            <InspectorRow label="증빙자료" value={evidenceRows.length ? `${evidenceRows.length}/${itemCount} 첨부` : "미첨부"} />
            {resolution.bankTransactions?.length ? <InspectorRow label="통장거래" value={`${resolution.bankTransactions.length}/${itemCount} 연결`} /> : resolution.bankTransactionId ? <InspectorRow label="통장거래" value="1건 연결" /> : null}
            {isCorporateCardPayment ? <InspectorRow label="결제수단" value={resolution.cardSettlementMode === "BANK_DIRECT" ? "법인카드 · 통장 건별출금" : "법인카드 · 카드사 합계청구"} /> : null}
          </dl>
        </section>

        <div className="mt-4 border-t border-[var(--color-soft-border)] pt-2">
          <details className="border-b border-[var(--color-soft-border)] py-2 text-sm">
            <summary className="cursor-pointer list-none font-bold">기본정보</summary>
            <dl className="mt-2 grid gap-2 rounded-lg bg-[var(--color-cloud-veil)]/60 p-3"><InspectorRow label="작성일" value={resolution.createdAt} /><InspectorRow label="작성자" value={resolution.author} /><InspectorRow label="작성경로" value={resolution.creationSource === "APPROVAL_LINKED" ? "기안 연결" : "직접 작성"} /><InspectorRow label="이체확인증" value={transferReceiptAttached} /></dl>
          </details>
          <details className="border-b border-[var(--color-soft-border)] py-2 text-sm">
            <summary className="cursor-pointer list-none font-bold">연결정보</summary>
            <dl className="mt-2 grid gap-2 rounded-lg bg-[var(--color-cloud-veil)]/60 p-3"><InspectorRow label="관련계약" value={resolution.relatedContract || "없음"} /><InspectorRow label="관련회의" value={resolution.relatedMeeting || "없음"} /><InspectorRow label="관련전표" value={getRelatedVoucherNo(resolution)} /></dl>
          </details>
          <button className="flex w-full items-center justify-between border-b border-[var(--color-soft-border)] py-3 text-left text-sm font-bold" onClick={() => setActiveView("history")} type="button"><span>처리이력</span><span className="text-[var(--color-stone)]">{timelineItems.length}건</span></button>
          {hasRelatedInformation ? null : <p className="pt-2 text-xs text-[var(--color-stone)]">연결된 계약·회의·전표가 없습니다.</p>}
        </div>
      </aside>
    </div>
  );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return <div className="border-r border-blue-100 px-3 py-2.5 last:border-r-0"><dt className="text-[11px] font-bold text-[var(--color-stone)]">{label}</dt><dd className="mt-0.5 truncate font-black text-[var(--color-midnight-ink)]">{value}</dd></div>;
}

function InlineFact({ label, value }: { label: string; value: ReactNode }) {
  return <div><p className="text-[11px] font-bold text-[var(--color-stone)]">{label}</p><div className="mt-1 font-semibold text-[var(--color-midnight-ink)]">{value}</div></div>;
}

function InspectorRow({ emphasized = false, label, value }: { emphasized?: boolean; label: string; value: ReactNode }) {
  return <div className="grid grid-cols-[90px_1fr] items-start gap-2"><dt className="text-[var(--color-stone)]">{label}</dt><dd className={`text-right ${emphasized ? "text-base font-black" : "font-semibold"}`}>{value}</dd></div>;
}

export function ExpenseResolutionDetailModal({
  actionError,
  budgetDataError,
  canApprove = false,
  editHref,
  linkedApproval,
  onApprove,
  onCancelApproval,
  onCancelVoucher,
  onClose,
  onConfirmVoucher,
  onCreateFactConfirmation,
  onDelete,
  onEdit,
  onCreateVoucher,
  onPrintArchive,
  onPrintPreview,
  onProcessPayment,
  onReject,
  onRequestApproval,
  resolution,
  voucherHref,
}: {
  actionError?: string;
  budgetDataError?: string;
  canApprove?: boolean;
  editHref?: string;
  linkedApproval?: ApprovalDocumentCandidate;
  onApprove: () => boolean | void | Promise<boolean | void>;
  onCancelApproval?: () => void;
  onCancelVoucher?: () => void;
  onClose: () => void;
  onConfirmVoucher?: () => void;
  onCreateFactConfirmation?: (detailItem?: BatchExpenseItem) => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onCreateVoucher?: () => void;
  onPrintArchive: () => void;
  onPrintPreview: () => void;
  onProcessPayment?: () => void;
  onReject: () => void;
  onRequestApproval: () => boolean | void | Promise<boolean | void>;
  resolution: ManagedExpenseResolution;
  voucherHref?: string;
}) {
  const evidenceRows = getEvidenceRows(resolution);
  const isCorporateCardPayment = normalizeExpenseTiming(resolution) === "REIMBURSEMENT" && resolution.expenseBurdenType === "CORPORATE_CARD";
  const approvalLine = getDisplayApprovalLine(resolution);
  const authorization = getExpenseAuthorizationReadiness(resolution);
  const [historySort, setHistorySort] = useState<"asc" | "desc">("asc");
  const [isApprovalActionPending, setIsApprovalActionPending] = useState(false);
  const [isManageMenuOpen, setIsManageMenuOpen] = useState(false);
  const [isPrintMenuOpen, setIsPrintMenuOpen] = useState(false);
  const timelineItems = [...resolution.history].sort((first, second) =>
    historySort === "asc" ? first.actionAt.localeCompare(second.actionAt) : second.actionAt.localeCompare(first.actionAt),
  );
  const transferReceiptAttached = resolution.paymentStatus === "지급완료" || resolution.transferReceiptStatus ? "첨부" : "미첨부";

  async function handleApprove() {
    if (isApprovalActionPending) return;
    setIsApprovalActionPending(true);
    try { await onApprove(); } finally { setIsApprovalActionPending(false); }
  }

  function handleReject() {
    onReject();
  }

  function handlePayment() {
    onProcessPayment?.();
  }

  async function handleRequestApproval() {
    if (isApprovalActionPending) return;
    setIsApprovalActionPending(true);
    try { await onRequestApproval(); } finally { setIsApprovalActionPending(false); }
  }

  function handlePrintPreview() {
    setIsPrintMenuOpen(false);
    onPrintPreview();
  }

  function handlePrintArchive() {
    setIsPrintMenuOpen(false);
    onPrintArchive();
  }

  function renderEditAction(label: string) {
    if (editHref) return <a className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--color-soft-border)] bg-white px-4 text-sm font-semibold" href={editHref}>{label}</a>;
    return onEdit ? <Button className="rounded-full" onClick={onEdit} variant="outline">{label}</Button> : null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-sky-wash)]/88 p-3" onClick={onClose}>
      <section
        aria-labelledby="expense-resolution-detail-title"
        aria-modal="true"
        className="flex h-[calc(100vh-24px)] w-full max-w-[1480px] flex-col overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] shadow-[0_24px_80px_rgba(16,20,24,0.22)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex flex-none items-center justify-between gap-4 border-b border-[var(--color-soft-border)] px-5 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            <h2 className="text-xl font-black" id="expense-resolution-detail-title">지출결의서 상세</h2>
            <span className="hidden h-7 w-px bg-[var(--color-soft-border)] sm:block" />
            <p className="text-lg font-black">{resolution.resolutionNo}</p>
            <Badge value={resolution.approvalStatus} />
            <Badge value={resolution.paymentStatus} />
            <span className="hidden h-7 w-px bg-[var(--color-soft-border)] sm:block" />
            <p className="text-xl font-black">총 {formatExpenseResolutionAmount(resolution.totalPaymentAmount)}</p>
          </div>
          <button aria-label="상세 닫기" className="rounded-full border border-[var(--color-soft-border)] bg-white p-2 text-[var(--color-stone)]" onClick={onClose} type="button">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-none overflow-x-auto border-b border-[var(--color-soft-border)] bg-white">
          <div><p className="px-5 pt-2 text-xs font-semibold text-slate-600">{policySummary(resolution.approvalPolicy)}</p><ExpenseApprovalFlowStrip approvalLine={approvalLine} resolution={resolution} /></div>
        </div>

        {compactExpenseDetailLayoutEnabled ? (
          <ExpenseResolutionDetailWorkspace
            actionError={actionError}
            approvalLine={approvalLine}
            budgetDataError={budgetDataError}
            canApprove={canApprove}
            evidenceRows={evidenceRows}
            isCorporateCardPayment={isCorporateCardPayment}
            isApprovalActionPending={isApprovalActionPending}
            linkedApproval={linkedApproval}
            onApprove={() => { void handleApprove(); }}
            onConfirmVoucher={onConfirmVoucher}
            onCreateFactConfirmation={onCreateFactConfirmation}
            onCreateVoucher={onCreateVoucher}
            onProcessPayment={onProcessPayment}
            onReject={handleReject}
            onRequestApproval={() => { void handleRequestApproval(); }}
            resolution={resolution}
            timelineItems={timelineItems}
            transferReceiptAttached={transferReceiptAttached}
          />
        ) : (
        <div className="grid max-h-[72vh] gap-5 overflow-y-auto bg-[var(--color-sky-wash)]/45 p-6 xl:grid-cols-2">
          {resolution.workflowTransactionId ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950 xl:col-span-2">
              <p className="font-bold">통합 회계·자금 업무에 연결됨</p>
              <p className="mt-1 leading-6">이 화면에서는 결의와 증빙을 확인하고, 실제 지급과 전표 확정은 각각 전용 원장에서 처리해.</p>
              <div className="mt-3 flex flex-wrap gap-4 font-semibold underline">
                <Link href="/finance/payments">지급관리로 이동</Link>
                <Link href="/finance">수입·지출 전표관리로 이동</Link>
              </div>
            </div>
          ) : null}
          {resolution.resolutionType === "BATCH" ? (
            <>
              <DetailSection title="프로젝트 일괄 지출결의 요약" wide>
                <DetailItem label="작성방식" value={getResolutionTypeFullLabel(resolution.resolutionType)} />
                <DetailItem label="프로젝트/사업과제" value={resolution.projectName || "-"} />
                <DetailItem label="대표 계정항목" value={getResolutionAccountTitle(resolution)} />
                <DetailItem label="대표 거래처" value={resolution.representativeVendorName} />
                <DetailItem label="총지급액" value={formatExpenseResolutionAmount(resolution.totalPaymentAmount)} />
                <DetailItem label="항목수" value={`${resolution.itemCount}건`} />
                <DetailItem label="예산초과 항목 수" value={getBudgetOverLabel(resolution.overBudgetItemCount)} />
                <DetailItem label="총 예산초과금액" value={formatExpenseResolutionAmount(resolution.totalOverBudgetAmount)} />
              </DetailSection>

              <DetailSection title="세부 지출내역" wide>
                <div className="overflow-x-auto rounded-lg border border-[var(--color-soft-border)] bg-white md:col-span-2">
                  <table className="w-full min-w-[1320px] text-left text-sm">
                    <thead className="bg-[var(--color-cloud-veil)] text-xs text-[var(--color-stone)]">
                      <tr>
                        {["순번", "거래일", "실제 지출자", "거래처", "지출항목명", "업무목적", "계정항목", "예산항목", "공급가액", "부가세", "합계", "예산상태", "지급상태", "증빙", "사실확인서", "전표번호"].map((column) => (
                          <th className="px-3 py-2" key={column}>
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-soft-border)]">
                      {resolution.expenseItems.map((item) => (
                        <tr className={item.budgetStatus === "OVER_BUDGET" ? "bg-[var(--color-sunset-soft)]/25" : "bg-white"} key={item.id}>
                          <td className="px-3 py-3 font-bold">{item.itemNo}</td>
                          <td className="px-3 py-3 text-[var(--color-stone)]">{item.expenseDate || "-"}</td>
                          <td className="px-3 py-3">{item.actualSpender || resolution.author}</td>
                          <td className="px-3 py-3 font-semibold">{item.vendorName || "거래처 미입력"}</td>
                          <td className="px-3 py-3">{item.itemTitle}</td>
                          <td className="px-3 py-3">{item.businessPurpose || resolution.reason}</td>
                          <td className="px-3 py-3">{item.accountTitle}</td>
                          <td className="px-3 py-3">{item.budgetItem}</td>
                          <td className="px-3 py-3 text-right">{formatExpenseResolutionAmount(toNumber(item.supplyAmount))}</td>
                          <td className="px-3 py-3 text-right">{formatExpenseResolutionAmount(toNumber(item.vatAmount))}</td>
                          <td className="px-3 py-3 text-right font-bold">{formatExpenseResolutionAmount(item.totalAmount)}</td>
                          <td className="px-3 py-3">
                            <Badge value={item.budgetStatus === "OVER_BUDGET" ? "예산초과" : "정상"} />
                          </td>
                          <td className="px-3 py-3">
                            <Badge value={item.paymentStatus} />
                          </td>
                          <td className="px-3 py-3">{item.evidenceFileName || item.evidenceType || "미첨부"}</td>
                          <td className="px-3 py-3">{onCreateFactConfirmation ? <button className="rounded-full border border-[var(--color-soft-border)] px-2.5 py-1 text-xs font-bold text-[var(--color-deep-cobalt)]" onClick={() => onCreateFactConfirmation(item)} type="button">작성</button> : item.factConfirmationId ? "연결됨" : "-"}</td>
                          <td className="px-3 py-3 font-semibold text-[var(--color-deep-cobalt)]">{item.voucherNo ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DetailSection>
            </>
          ) : null}

          {isLegacySmallExpenseResolution(resolution) ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-bold">기존 소액 일괄결의 · 조회 전용</p>
              <p className="mt-1 leading-6">내용 수정과 삭제는 중단됐어. 기존 승인·지급 이력 확인과 출력, 진행 중인 후속 처리는 계속할 수 있어.</p>
            </div>
          ) : null}

          <DetailSection title="기본정보">
            <DetailItem label="결의서번호" value={resolution.resolutionNo} />
            <DetailItem label="작성경로" value={resolution.creationSource === "APPROVAL_LINKED" ? `기안연결 · ${resolution.approvalDocumentNo ?? "문서번호 미확인"}` : isLegacySmallExpenseResolution(resolution) ? "기존 소액 일괄결의 · 조회 전용" : resolution.creationSource === "CONTRACT_PAYMENT" ? "계약 분할지급" : `직접 작성 · ${resolution.approvalSkipReason ?? "생략 사유 미입력"}`} />
            <DetailItem label="작성방식" value={getResolutionTypeFullLabel(resolution.resolutionType)} />
            <DetailItem label="건명" value={getResolutionSubject(resolution)} wide />
            <DetailItem label="작성일" value={resolution.createdAt} />
            <DetailItem label="작성자" value={resolution.author} />
            <DetailItem label="지출예정일" value={resolution.plannedPaymentDate || "-"} />
            <DetailItem label="승인상태" value={<Badge value={resolution.approvalStatus} />} />
            <DetailItem label="지급상태" value={<Badge value={resolution.paymentStatus} />} />
            <DetailItem label="현재결재자" value={resolution.currentApprover ?? "없음"} />
          </DetailSection>

          <DetailSection title="지출정보">
            <DetailItem label="지출구분" value={resolution.expenseType} />
            <DetailItem label="예산항목" value={resolution.budgetItem || "-"} />
            <DetailItem label="거래처명" value={resolution.vendorName} />
            <DetailItem label="총지급액" value={formatExpenseResolutionAmount(resolution.totalPaymentAmount)} />
            <DetailItem label="공급가액" value={formatExpenseResolutionAmount(resolution.supplyAmount)} />
            <DetailItem label="세금구분" value={getResolutionTaxCategorySummary(resolution)} />
            <DetailItem label="부가세" value={formatExpenseResolutionAmount(resolution.vat)} />
            <DetailItem label="지출사유" value={resolution.reason || "-"} wide />
          </DetailSection>

          <DetailSection title={isCorporateCardPayment ? "법인카드 결제정보" : "지급정보"}>
            {isCorporateCardPayment ? <><DetailItem label="결제수단" value={resolution.cardSettlementMode === "BANK_DIRECT" ? "법인 체크카드 · 통장 건별출금" : "법인 신용카드 · 카드사 합계청구"} /><DetailItem label="확인 원본" value={resolution.cardVerificationSource === "BANK_TRANSACTION" ? `통장거래 ${resolution.bankTransactions?.length ?? (resolution.bankTransactionId ? 1 : 0)}건` : resolution.cardTransactionId ? "카드 승인내역" : "연결대기"} /><DetailItem label="카드번호" value={resolution.cardLastFour ? `끝 ${resolution.cardLastFour}` : "미입력"} /></> : <><DetailItem label="지급은행" value={resolution.paymentBank || "-"} /><DetailItem label="지급계좌번호" value={resolution.paymentAccountNo || "-"} /><DetailItem label="예금주" value={resolution.accountHolder || "-"} /></>}
            <DetailItem label="지급예정일" value={resolution.plannedPaymentDate || "-"} />
            <DetailItem label="지급일" value={resolution.paidAt ?? "-"} />
            <DetailItem label="업무유형" value={getExpenseTimingLabel(normalizeExpenseTiming(resolution))} />
            <DetailItem label="지급상태" value={<Badge value={resolution.paymentStatus} />} />
            <DetailItem label="정산상태" value={resolution.settlementStatus} />
            <DetailItem label="이체확인증 첨부 여부" value={transferReceiptAttached} />
          </DetailSection>

          <DetailSection title="예산반영">
            <DetailItem label="예산기간" value={resolution.budgetSnapshot.budgetPeriod} />
            <DetailItem label="예산항목" value={resolution.budgetItem || "-"} />
            <DetailItem label="월 예산" value={formatExpenseResolutionAmount(resolution.budgetSnapshot.monthlyBudgetAmount)} />
            <DetailItem label="2025년(전기) 연간예산" value={formatExpenseResolutionAmount(resolution.budgetSnapshot.previousAnnualBudgetAmount)} />
            <DetailItem label="2026년(당기) 연간예산" value={formatExpenseResolutionAmount(resolution.budgetSnapshot.currentAnnualBudgetAmount)} />
            <DetailItem label="내역 및 산출근거" value={resolution.budgetSnapshot.calculationBasis} wide />
            <DetailItem label="기집행액" value={formatExpenseResolutionAmount(resolution.budgetSnapshot.usedAmount)} />
            <DetailItem label="승인대기액" value={formatExpenseResolutionAmount(resolution.budgetSnapshot.pendingApprovalAmount)} />
            <DetailItem label="지급대기액" value={formatExpenseResolutionAmount(resolution.budgetSnapshot.paymentWaitingAmount)} />
            <DetailItem label="이번 결의금액" value={formatExpenseResolutionAmount(resolution.budgetSnapshot.currentRequestAmount)} />
            <DetailItem label="월 예상 누계" value={formatExpenseResolutionAmount(resolution.budgetSnapshot.expectedUsedAmount)} />
            <DetailItem label="월 예상 잔여예산" value={formatExpenseResolutionAmount(resolution.budgetSnapshot.remainingBudgetAmount)} />
            <DetailItem label="집행률" value={`${resolution.budgetSnapshot.budgetUsageRate}%`} />
            <DetailItem label="예산검토" value={<Badge value={resolution.budgetSnapshot.budgetCheckStatus} />} />
          </DetailSection>

          <DetailSection title="연결정보">
            <DetailItem label="관련계약" value={resolution.relatedContract || "-"} />
            <DetailItem label="관련회의/의결" value={resolution.relatedMeeting || "-"} />
            <DetailItem label="관련 전표번호" value={getRelatedVoucherNo(resolution)} />
            <DetailItem label="전표상태" value={<Badge value={getVoucherStatusLabel(resolution)} />} />
            <DetailItem label="관련 예산항목" value={resolution.budgetItem || "-"} />
          </DetailSection>

          <DetailSection title="출력보관" wide>
            <div className="overflow-hidden rounded-lg border border-[var(--color-soft-border)] bg-white">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-[var(--color-cloud-veil)] text-xs text-[var(--color-stone)]">
                  <tr>
                    <th className="px-3 py-2">출력번호</th>
                    <th className="px-3 py-2">출력일시</th>
                    <th className="px-3 py-2">출력자</th>
                    <th className="px-3 py-2">출력목적</th>
                    <th className="px-3 py-2">출력본</th>
                    <th className="px-3 py-2">보관위치</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-soft-border)]">
                  {resolution.printRecords.length > 0 ? (
                    resolution.printRecords.map((record) => (
                      <tr key={record.id}>
                        <td className="px-3 py-3 font-semibold text-[var(--color-deep-cobalt)]">{record.printNo}</td>
                        <td className="px-3 py-3 text-[var(--color-stone)]">{record.printedAt}</td>
                        <td className="px-3 py-3">{record.printedBy}</td>
                        <td className="px-3 py-3">{record.printPurpose}</td>
                        <td className="px-3 py-3">{record.copyKind}</td>
                        <td className="px-3 py-3 text-[var(--color-stone)]">{record.storageLocation ?? "보관위치 미등록"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-3 py-4 text-center text-[var(--color-stone)]" colSpan={6}>
                        아직 출력 또는 보관 이력이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </DetailSection>

          <DetailSection title="결재선" wide>
            <div className="overflow-hidden rounded-lg border border-[var(--color-soft-border)] bg-white">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-[var(--color-cloud-veil)] text-xs text-[var(--color-stone)]">
                  <tr>
                    <th className="px-3 py-2">순서</th>
                    <th className="px-3 py-2">결재자</th>
                    <th className="px-3 py-2">직책</th>
                    <th className="px-3 py-2">결재상태</th>
                    <th className="px-3 py-2">처리일</th>
                    <th className="px-3 py-2">의견</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-soft-border)]">
                  {approvalLine.map((step) => (
                    <tr key={step.order}>
                      <td className="px-3 py-3">{step.order}차</td>
                      <td className="px-3 py-3 font-semibold">{step.approver}</td>
                      <td className="px-3 py-3">{step.role}</td>
                      <td className="px-3 py-3">
                        <Badge value={step.status} />
                      </td>
                      <td className="px-3 py-3 text-[var(--color-stone)]">{step.processedAt ?? "-"}</td>
                      <td className="px-3 py-3 text-[var(--color-stone)]">
                        {step.status === "반려" ? (resolution.rejectionReason ?? "반려") : step.status === "승인완료" ? "승인" : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DetailSection>

          <DetailSection title="증빙자료" wide>
            <div className="overflow-hidden rounded-lg border border-[var(--color-soft-border)] bg-white">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-[var(--color-cloud-veil)] text-xs text-[var(--color-stone)]">
                  <tr>
                    <th className="px-3 py-2">증빙유형</th>
                    <th className="px-3 py-2">파일명</th>
                    <th className="px-3 py-2">발행처</th>
                    <th className="px-3 py-2">금액</th>
                    <th className="px-3 py-2">첨부일</th>
                    <th className="px-3 py-2">보기</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-soft-border)]">
                  {evidenceRows.map((evidence) => (
                    <tr key={`${evidence.evidenceType}-${evidence.fileName}`}>
                      <td className="px-3 py-3 font-semibold">{evidence.evidenceType}</td>
                      <td className="px-3 py-3 text-[var(--color-stone)]">{evidence.fileName}</td>
                      <td className="px-3 py-3">{evidence.issuer}</td>
                      <td className="px-3 py-3 text-right font-semibold">{formatExpenseResolutionAmount(evidence.amount)}</td>
                      <td className="px-3 py-3 text-[var(--color-stone)]">{evidence.attachedAt}</td>
                      <td className="px-3 py-3">
                        <button className="rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]" type="button">
                          보기
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DetailSection>

          <DetailSection title="처리이력" wide>
            <div className="md:col-span-2">
              <div className="mb-3 flex justify-end gap-2">
                {[
                  { label: "오래된순", value: "asc" as const },
                  { label: "최신순", value: "desc" as const },
                ].map((option) => (
                  <button
                    className={`rounded-full border border-[var(--color-soft-border)] px-3 py-1.5 text-xs font-semibold ${
                      historySort === option.value ? "bg-[var(--color-pressed-charcoal)] text-white" : "bg-white text-[var(--color-stone)]"
                    }`}
                    key={option.value}
                    onClick={() => setHistorySort(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <ol className="grid gap-3">
                {timelineItems.map((item) => (
                  <li className="grid gap-3 rounded-lg border border-[var(--color-soft-border)] bg-white p-4 text-sm md:grid-cols-[150px_22px_1fr]" key={item.id}>
                    <time className="font-semibold text-[var(--color-stone)]">{item.actionAt}</time>
                    <span className="relative flex justify-center">
                      <span className={`mt-1.5 size-3 rounded-full ${getHistoryTone(item.actionType).split(" ")[0]}`} />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-[var(--color-midnight-ink)]">
                          {formatHistoryActor(item)} · {item.actionLabel}
                        </p>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getHistoryTone(item.actionType)}`}>{item.actionLabel}</span>
                      </div>
                      {item.comment ? <p className="mt-2 leading-6 text-[var(--color-stone)]">{item.comment}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </DetailSection>
        </div>
        )}

        <div className="flex flex-none flex-wrap justify-end gap-2 border-t border-[var(--color-soft-border)] bg-white px-5 py-3">
          {onCreateFactConfirmation ? <Button className="rounded-full" onClick={() => onCreateFactConfirmation()} variant="outline">지출사실확인서 작성</Button> : null}
          <div className="relative">
            <Button
              aria-expanded={isPrintMenuOpen}
              aria-haspopup="menu"
              className="rounded-full"
              onClick={() => setIsPrintMenuOpen((current) => !current)}
              variant="outline"
            >
              인쇄하기
              <ChevronDown className="size-4" />
            </Button>
            {isPrintMenuOpen ? (
              <div
                className="absolute right-0 bottom-full z-10 mb-2 w-44 overflow-hidden rounded-xl border border-[var(--color-soft-border)] bg-white py-1 text-sm shadow-[0_16px_40px_rgba(16,20,24,0.16)]"
                role="menu"
              >
                <button
                  className="block w-full px-4 py-2.5 text-left font-semibold text-[var(--color-midnight-ink)] hover:bg-[var(--color-cloud-veil)]"
                  onClick={handlePrintPreview}
                  role="menuitem"
                  type="button"
                >
                  A4 출력 미리보기
                </button>
                <button
                  className="block w-full px-4 py-2.5 text-left font-semibold text-[var(--color-midnight-ink)] hover:bg-[var(--color-cloud-veil)]"
                  onClick={handlePrintArchive}
                  role="menuitem"
                  type="button"
                >
                  보관용 PDF 생성
                </button>
              </div>
            ) : null}
          </div>
          {onDelete && resolution.approvalStatus === "작성중" ? (
            <div className="relative">
              <Button aria-expanded={isManageMenuOpen} aria-haspopup="menu" aria-label="추가 작업" className="rounded-full px-3" onClick={() => setIsManageMenuOpen((current) => !current)} variant="outline">
                <MoreHorizontal className="size-4" />
              </Button>
              {isManageMenuOpen ? (
                <div className="absolute right-0 bottom-full z-10 mb-2 w-32 overflow-hidden rounded-xl border border-[var(--color-soft-border)] bg-white py-1 text-sm shadow-[0_16px_40px_rgba(16,20,24,0.16)]" role="menu">
                  <button className="block w-full px-4 py-2.5 text-left font-bold text-red-700 hover:bg-red-50" onClick={() => { setIsManageMenuOpen(false); onDelete(); }} role="menuitem" type="button">삭제</button>
                </div>
              ) : null}
            </div>
          ) : null}
          {resolution.approvalStatus === "작성중" ? (
            <>
              {renderEditAction("수정")}
              <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" disabled={isApprovalActionPending || !authorization.ready} onClick={() => { void handleRequestApproval(); }} title={!authorization.ready ? "작성자·결재선 로그인 계정 연결이 필요합니다." : undefined}>
                {isApprovalActionPending ? "처리 중" : authorization.ready ? "승인요청" : "계정 연결 필요"}
              </Button>
            </>
          ) : null}
          {resolution.approvalStatus === "승인대기" && (editHref || onEdit) ? (
            renderEditAction("수정 후 재요청")
          ) : null}
          {resolution.approvalStatus === "승인대기" && canApprove ? (
            <>
              <Button className="rounded-full" disabled={isApprovalActionPending} onClick={() => { void handleApprove(); }} variant="outline">
                {isApprovalActionPending ? "처리 중" : "승인"}
              </Button>
              <Button className="rounded-full text-[var(--color-tangerine)]" onClick={handleReject} variant="outline">
                반려
              </Button>
            </>
          ) : null}
          {onProcessPayment && resolution.approvalStatus === "승인완료" && ["지급대기", "부분지급"].includes(resolution.paymentStatus) ? (
            <><Button className="rounded-full" onClick={onCancelApproval} variant="outline">승인취소</Button><Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" onClick={handlePayment}>지급처리</Button></>
          ) : null}
          {onCreateVoucher && resolution.paymentStatus === "지급완료" && !resolution.voucherNo ? (
            <Button className="rounded-full" onClick={onCreateVoucher} variant="outline">
              전표초안 생성
            </Button>
          ) : null}
          {onConfirmVoucher && resolution.paymentStatus === "지급완료" && resolution.voucherStatus === "전표초안" ? (
            <Button className="rounded-full" onClick={onConfirmVoucher} variant="outline">
              전표확정
            </Button>
          ) : null}
          {resolution.voucherStatus === "전표확정" ? (
            <>{voucherHref ? <a className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--color-soft-border)] bg-white px-4 text-sm font-semibold" href={voucherHref}>전표보기</a> : null}{onCancelVoucher ? <Button className="rounded-full text-red-700" onClick={onCancelVoucher} variant="outline">전표취소</Button> : null}</>
          ) : null}
          {resolution.approvalStatus === "반려" && (editHref || onEdit) ? (
            renderEditAction("수정 후 재요청")
          ) : null}
          <Button className="rounded-full" onClick={onClose} variant="outline">
            닫기
          </Button>
        </div>
      </section>
    </div>
  );
}
function DetailSection({ children, title, wide }: { children: ReactNode; title: string; wide?: boolean }) {
  return (
    <section className={`rounded-xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-4 ${wide ? "xl:col-span-2" : ""}`}>
      <h3 className="mb-3 text-base font-bold">{title}</h3>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  );
}

export function DetailItem({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={`rounded-lg border border-[var(--color-soft-border)] bg-white px-4 py-3 ${wide ? "md:col-span-2" : ""}`}>
      <p className="text-xs font-bold text-[var(--color-fog)]">{label}</p>
      <div className="mt-2 text-sm font-semibold leading-6 text-[var(--color-midnight-ink)]">{value}</div>
    </div>
  );
}
