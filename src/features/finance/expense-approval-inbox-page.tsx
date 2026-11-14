"use client";

import { canApproveExpense } from "./expense-access-model";
import type { ReimbursementMember } from "./reimbursement-domain";
import { Search, X } from "lucide-react";
import { Fragment, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import { formatExpenseResolutionAmount } from "./expense-resolution-data";
import {
  ExpenseResolutionDetailModal,
  ExpenseResolutionPrintPreviewModal,
} from "./expense-resolution-page";
import type { ManagedExpenseResolution } from "./expense-resolution-page";
import type { ApprovalTransitionRequest, BatchApprovalTransitionRequest } from "./expense-approval-workflow";
import type { DisbursementTransitionRequest, DisbursementTransitionResult } from "./expense-disbursement-workflow";

function Badge({ value }: { value: string }) {
  const classes: Record<string, string> = {
    작성중: "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]",
    승인대기: "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
    승인완료: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
    반려: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
    지급전: "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]",
    지급대기: "bg-[var(--color-lilac-mist)] text-[var(--color-amethyst)]",
    지급완료: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
    보류: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
  };

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${classes[value] ?? classes.작성중}`}>{value}</span>;
}

export function ExpenseApprovalInboxPage({ viewer, budgetDataError, createEvidenceDownloadUrl, dataLoadError, initialResolutions, transitionApproval, transitionBatchApproval, transitionDisbursement, embedded = false, initialDetailId }: { budgetDataError?: string; createEvidenceDownloadUrl?: (storagePath: string) => Promise<string>; embedded?: boolean; initialDetailId?: string; viewer?: ReimbursementMember; dataLoadError?: string; initialResolutions?: ManagedExpenseResolution[]; transitionApproval?: (input: ApprovalTransitionRequest) => Promise<ManagedExpenseResolution>; transitionBatchApproval?: (input: BatchApprovalTransitionRequest) => Promise<ManagedExpenseResolution[]>; transitionDisbursement?: (input: DisbursementTransitionRequest) => Promise<DisbursementTransitionResult> } = {}) {
  const currentApproverLabel = viewer?.display_name ?? "로그인 필요";
  const router = useRouter();
  const busy = useRef(false);
  const [processing, setProcessing] = useState(false);
  const [filter, setFilter] = useState("내 결재대기");
  const [search, setSearch] = useState("");
  const [resolutions, setResolutions] = useState<ManagedExpenseResolution[]>(() => initialResolutions ?? []);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(initialDetailId ?? null);
  const [printPreviewTargetId, setPrintPreviewTargetId] = useState<string | null>(null);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [workflowError, setWorkflowError] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchReferenceDate, setBatchReferenceDate] = useState("");
  const [batchReason, setBatchReason] = useState("");
  const selectedDetail = selectedDetailId ? resolutions.find((resolution) => resolution.id === selectedDetailId) : undefined;
  const printPreviewTarget = printPreviewTargetId ? resolutions.find((resolution) => resolution.id === printPreviewTargetId) : undefined;
  const rejectTarget = rejectTargetId ? resolutions.find((resolution) => resolution.id === rejectTargetId) : undefined;

  const myPending = resolutions.filter(r => viewer && canApproveExpense(r, viewer));
  const selectedPending = myPending.filter((resolution) => selectedIds.includes(resolution.id));
  const summary = {
    myPendingCount: myPending.length,
    completedCount: resolutions.filter(r => r.approvalStatus === "승인완료").length,
    rejectedCount: resolutions.filter(r => r.approvalStatus === "반려").length,
    waitingAmount: myPending.reduce((sum, r) => sum + r.totalPaymentAmount, 0),
  };
  const filtered = resolutions.filter(r => {
    const matchesStatus = filter === "전체" || (filter === "내 결재대기" && !!viewer && canApproveExpense(r, viewer)) ||
      (filter === "결재완료" && r.approvalStatus === "승인완료") || (filter === "반려" && r.approvalStatus === "반려") ||
      (filter === "지급대기" && r.approvalStatus === "승인완료" && ["지급전", "지급대기"].includes(r.paymentStatus));
    return matchesStatus && [r.resolutionNo, r.subject, r.author, r.representativeVendorName, r.currentApprover].join(" ").toLowerCase().includes(search.trim().toLowerCase());
  });

  async function runTransition(resolution: ManagedExpenseResolution, command: "APPROVE" | "REJECT", reason?: string) {
    if (busy.current || !viewer || !canApproveExpense(resolution, viewer)) return false;
    busy.current = true; setProcessing(true);
    setWorkflowError("");
    try {
      if (!transitionApproval) throw new Error("승인 저장 기능에 연결하지 못했어. 새로고침 후 다시 시도해줘.");
      const transitioned = await transitionApproval({ actorLabel: currentApproverLabel, command, expectedCurrentApprover: resolution.currentApprover, expectedStatus: resolution.approvalStatus, expectedAuthorizationVersion: resolution.authorization?.version, reason, resolutionId: resolution.id });
      setResolutions((current) => current.map((item) => item.id === transitioned.id ? transitioned : item));
      router.refresh();
      return true;
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : "결재 상태를 변경하지 못했습니다.");
      return false;
    } finally { busy.current = false; setProcessing(false); }
  }

  async function approveResolution(id: string) {
    const resolution = resolutions.find((item) => item.id === id);
    if (resolution) await runTransition(resolution, "APPROVE");
  }

  function openBatchApproval() {
    if (!selectedPending.length) return;
    const expenseMonths = [...new Set(selectedPending.map((resolution) => resolution.actualExpenseDate?.slice(0, 7)).filter(Boolean))];
    const month = expenseMonths.length === 1 ? expenseMonths[0]! : undefined;
    setBatchReferenceDate(month ? firstDayOfNextMonth(month) : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }));
    setBatchReason(month
      ? `${Number(month.slice(0, 4))}년 ${Number(month.slice(5, 7))}월 조합통장 출금분 일괄 사후승인(현금카드 포함)`
      : "조합통장 출금분 일괄 사후승인(현금카드 포함)");
    setBatchOpen(true);
  }

  async function approveSelectedBatch() {
    if (busy.current || !transitionBatchApproval || !batchReferenceDate || !batchReason.trim()) return;
    busy.current = true;
    setProcessing(true);
    setWorkflowError("");
    try {
      const transitioned = await transitionBatchApproval({
        idempotencyKey: crypto.randomUUID(),
        items: selectedPending.map((resolution) => ({
          expectedAuthorizationVersion: resolution.authorization?.version,
          expectedCurrentApprover: resolution.currentApprover,
          expectedStatus: resolution.approvalStatus,
          resolutionId: resolution.id,
        })),
        reason: batchReason.trim(),
        referenceDate: batchReferenceDate,
      });
      const changed = new Map(transitioned.map((resolution) => [resolution.id, resolution]));
      setResolutions((current) => current.map((resolution) => changed.get(resolution.id) ?? resolution));
      setSelectedIds([]);
      setBatchOpen(false);
      router.refresh();
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : "일괄 결재를 처리하지 못했습니다.");
    } finally {
      busy.current = false;
      setProcessing(false);
    }
  }

  async function runDisbursementTransition(resolution: ManagedExpenseResolution, command: DisbursementTransitionRequest["command"]) {
    if (busy.current) return false;
    busy.current = true; setProcessing(true);
    setWorkflowError("");
    try {
      if (!transitionDisbursement) throw new Error("전표 저장 기능에 연결하지 못했어. 새로고침 후 다시 시도해줘.");
      const result = await transitionDisbursement({
        actorLabel: currentApproverLabel,
        command,
        expectedPaymentStatus: resolution.paymentStatus,
        expectedVoucherStatus: resolution.voucherStatus,
        idempotencyKey: crypto.randomUUID(),
        resolutionId: resolution.id,
      });
      if (!result.ok) {
        setWorkflowError(result.error);
        return false;
      }
      const transitioned = result.data;
      setResolutions((current) => current.map((item) => item.id === transitioned.id ? transitioned : item));
      router.refresh();
      return true;
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : "전표 상태를 변경하지 못했습니다.");
      return false;
    } finally { busy.current = false; setProcessing(false); }
  }

  async function createVoucher(id: string) {
    const resolution = resolutions.find((item) => item.id === id);
    if (resolution) await runDisbursementTransition(resolution, "VOUCHER_CREATE");
  }

  async function confirmVoucher(id: string) {
    const resolution = resolutions.find((item) => item.id === id);
    if (resolution) await runDisbursementTransition(resolution, "VOUCHER_CONFIRM");
  }

  function openRejectModal(id: string) {
    setRejectTargetId(id);
    setRejectionReason("");
  }

  function closeRejectModal() {
    setRejectTargetId(null);
    setRejectionReason("");
  }

  async function rejectResolution() {
    const reason = rejectionReason.trim();
    if (!rejectTargetId || !reason) {
      return;
    }

    const resolution = resolutions.find((item) => item.id === rejectTargetId);
    if (resolution && await runTransition(resolution, "REJECT", reason)) closeRejectModal();
  }

  const Container = embedded ? Fragment : ErpShell;
  return (
    <Container {...(embedded ? {} : { userLabel: currentApproverLabel, activeDetailLabel: "지출 승인함", activeLabel: "회계·자금", activeWorkspaceLabel: "전표·증빙" })}>
      {dataLoadError ? <div className="mx-auto mb-4 max-w-[1480px] rounded-xl border border-[var(--color-tangerine)]/30 bg-[var(--color-sunset-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-tangerine)]" role="alert">{dataLoadError}</div> : null}
      {workflowError ? <div className="mx-auto mb-4 max-w-[1480px] rounded-xl border border-[var(--color-tangerine)]/30 bg-[var(--color-sunset-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-tangerine)]" role="alert">{workflowError}</div> : null}
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6">
        <section className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 lg:p-7">
          <p className="mb-3 inline-flex rounded-full bg-[var(--color-morning-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]">
            기안·결재 &gt; 통합 결재함 &gt; 지출결의
          </p>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-normal">지출결의 승인</h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--color-stone)]">
                내가 결재해야 할 지출결의서와 결재 진행 중인 문서를 확인하고 승인 또는 반려 처리합니다.
              </p>
            </div>
            <div className="rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-stone)]">
              현재 사용자: {currentApproverLabel}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-4">
          <SummaryTile label="내 결재대기" value={`${summary.myPendingCount}건`} />
          <SummaryTile label="결재완료" value={`${summary.completedCount}건`} />
          <SummaryTile label="반려 문서" value={`${summary.rejectedCount}건`} />
          <SummaryTile label="내 승인 대기금액" value={formatExpenseResolutionAmount(summary.waitingAmount)} />
        </section>

        <section className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
          {myPending.length ? (
            <div className="mb-4 flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold text-blue-950">일괄 결재</p>
                <p className="mt-1 text-sm text-blue-800">선택한 문서는 한 번에 검증하고, 한 건이라도 조건이 다르면 모두 처리하지 않아.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className="rounded-full border border-blue-300 bg-white px-3 py-2 text-sm font-semibold text-blue-900" onClick={() => setSelectedIds(selectedIds.length === myPending.length ? [] : myPending.map((resolution) => resolution.id))} type="button">
                  {selectedIds.length === myPending.length ? "선택 해제" : `내 결재대기 ${myPending.length}건 선택`}
                </button>
                <button className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={!selectedPending.length || processing || !transitionBatchApproval} onClick={openBatchApproval} type="button">
                  선택 {selectedPending.length}건 일괄 승인
                </button>
              </div>
            </div>
          ) : null}
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-2 rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2.5 text-sm text-[var(--color-fog)] xl:w-[430px]">
              <Search className="size-4 shrink-0" />
              <input aria-label="지출결의 검색" className="min-w-0 flex-1 text-slate-900 outline-none" placeholder="결의서번호, 작성자, 거래처 검색" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              {["전체", "내 결재대기", "결재완료", "반려", "지급대기"].map((label) => (
                <button
                  className={`rounded-full border px-3 py-2 text-sm font-semibold ${filter === label ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}
                  key={label}
                  aria-pressed={filter === label}
                  onClick={() => setFilter(label)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)]">
          <div className="border-b border-[var(--color-soft-border)] p-4">
            <h2 className="text-lg font-bold">결재함 목록</h2>
          </div>
          <div className="overflow-x-auto">
            <table aria-label="결재함 목록" className="w-full min-w-[1240px] border-collapse text-left text-sm">
              <thead className="bg-[var(--color-cloud-veil)] text-xs font-semibold text-[var(--color-stone)]">
                <tr>
                  <th className="px-3 py-3 text-center"><span className="sr-only">일괄 선택</span></th>
                  <th className="px-4 py-3 text-center">결의서번호</th>
                  <th className="px-4 py-3 text-center">작성일</th>
                  <th className="px-4 py-3 text-center">작성자</th>
                  <th className="px-4 py-3 text-center">거래처</th>
                  <th className="px-4 py-3 text-center">지출구분</th>
                  <th className="px-4 py-3 text-center">총지급액</th>
                  <th className="px-4 py-3 text-center">현재결재자</th>
                  <th className="px-4 py-3 text-center">승인상태</th>
                  <th className="px-4 py-3 text-center">지급상태</th>
                  <th className="px-4 py-3 text-center">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-soft-border)]">
              {filtered.map((resolution) => {
                const canApprove = !processing && !!viewer && canApproveExpense(resolution, viewer);

                  return (
                    <tr className="bg-white/70" key={resolution.id}>
                      <td className="px-3 py-4 text-center">
                        <input
                          aria-label={`${resolution.resolutionNo} 일괄 선택`}
                          checked={selectedIds.includes(resolution.id)}
                          className="size-4 accent-slate-900"
                          disabled={!canApprove}
                          onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, resolution.id] : current.filter((id) => id !== resolution.id))}
                          type="checkbox"
                        />
                      </td>
                      <td className="px-4 py-4 font-bold text-[var(--color-deep-cobalt)]">{resolution.resolutionNo}</td>
                      <td className="px-4 py-4 text-[var(--color-stone)]">{resolution.createdAt}</td>
                      <td className="px-4 py-4">{resolution.author}</td>
                      <td className="px-4 py-4 font-semibold">{resolution.vendorName}</td>
                      <td className="px-4 py-4">{resolution.expenseType}</td>
                      <td className="px-4 py-4 text-right font-bold">{formatExpenseResolutionAmount(resolution.totalPaymentAmount)}</td>
                      <td className="px-4 py-4 text-[var(--color-stone)]">{resolution.currentApprover ?? "없음"}</td>
                      <td className="px-4 py-4">
                        <Badge value={resolution.approvalStatus} />
                        {resolution.evidenceStatus === "NONE" ? <p className="mt-1 rounded bg-red-50 px-2 py-1 text-xs font-bold text-red-700">증빙 없음 · 추가 확인 필수</p> : resolution.evidenceStatus === "DEFICIENT" ? <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">증빙불비</p> : null}
                        {resolution.rejectionReason ? <p className="mt-1 text-xs text-[var(--color-tangerine)]">{resolution.rejectionReason}</p> : null}
                      </td>
                      <td className="px-4 py-4">
                        <Badge value={resolution.paymentStatus} />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            className="rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-stone)]"
                            onClick={() => setSelectedDetailId(resolution.id)}
                            type="button"
                          >
                            상세보기
                          </button>
                          <button
                            className="rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)] disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={!canApprove}
                            onClick={() => approveResolution(resolution.id)}
                            type="button"
                          >
                            승인
                          </button>
                          <button
                            className="rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-tangerine)] disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={!canApprove}
                            onClick={() => openRejectModal(resolution.id)}
                            type="button"
                          >
                            반려
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {selectedDetail ? (
        <ExpenseResolutionDetailModal
          actionError={workflowError}
          budgetDataError={budgetDataError}
          canApprove={!processing && !!viewer && canApproveExpense(selectedDetail, viewer)}
          onApprove={() => approveResolution(selectedDetail.id)}
          onClose={() => setSelectedDetailId(null)}
          onConfirmVoucher={() => confirmVoucher(selectedDetail.id)}
          onCreateVoucher={() => createVoucher(selectedDetail.id)}
          onPrintArchive={() => setPrintPreviewTargetId(selectedDetail.id)}
          onPrintPreview={() => setPrintPreviewTargetId(selectedDetail.id)}
          onReject={() => openRejectModal(selectedDetail.id)}
          onRequestApproval={() => undefined}
          resolution={selectedDetail}
          voucherHref={`/finance?resolutionId=${selectedDetail.id}`}
        />
      ) : null}

      {printPreviewTarget ? (
        <ExpenseResolutionPrintPreviewModal
          createEvidenceDownloadUrl={createEvidenceDownloadUrl}
          onClose={() => setPrintPreviewTargetId(null)}
          resolution={printPreviewTarget}
        />
      ) : null}

      {rejectTarget ? (
        <RejectReasonModal
          onCancel={closeRejectModal}
          onChange={setRejectionReason}
          onSubmit={rejectResolution}
          reason={rejectionReason}
          resolutionNo={rejectTarget.resolutionNo}
        />
      ) : null}

      {batchOpen ? (
        <div aria-label="일괄 승인 확인" aria-modal="true" className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4" role="dialog">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="text-xl font-bold">선택 {selectedPending.length}건 일괄 승인</h2><p className="mt-2 text-sm leading-6 text-slate-600">업무 기준일은 거래 정리 기준이야. 전자결재 승인 시각은 안동연 계정에서 실제로 승인한 시각으로 별도 기록돼.</p></div>
              <button aria-label="일괄 승인 닫기" className="rounded-full p-2 text-slate-500 hover:bg-slate-100" onClick={() => setBatchOpen(false)} type="button"><X className="size-5" /></button>
            </div>
            <label className="mt-5 block text-sm font-bold">업무 기준일<input className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" onChange={(event) => setBatchReferenceDate(event.target.value)} type="date" value={batchReferenceDate} /></label>
            <label className="mt-4 block text-sm font-bold">일괄 승인 사유<textarea className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm leading-6" maxLength={300} onChange={(event) => setBatchReason(event.target.value)} value={batchReason} /></label>
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">한 건이라도 결재자·상태·계정 연결이 달라졌으면 전체 승인이 취소돼.</p>
            <div className="mt-5 flex justify-end gap-2"><Button onClick={() => setBatchOpen(false)} type="button" variant="outline">취소</Button><Button disabled={processing || !batchReferenceDate || !batchReason.trim()} onClick={approveSelectedBatch} type="button">{processing ? "검증 중..." : `${selectedPending.length}건 승인`}</Button></div>
          </div>
        </div>
      ) : null}
    </Container>
  );
}

function firstDayOfNextMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function RejectReasonModal({
  onCancel,
  onChange,
  onSubmit,
  reason,
  resolutionNo,
}: {
  onCancel: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
  reason: string;
  resolutionNo: string;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--color-sky-wash)]/88 px-4" onClick={onCancel}>
      <section
        aria-labelledby="reject-reason-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] shadow-[0_24px_80px_rgba(16,20,24,0.22)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-soft-border)] px-6 py-5">
          <div>
            <h2 className="text-xl font-bold" id="reject-reason-title">
              반려사유 입력
            </h2>
            <p className="mt-2 text-sm text-[var(--color-stone)]">{resolutionNo} 문서를 반려하는 사유를 입력합니다.</p>
          </div>
          <button aria-label="닫기" className="rounded-full border border-[var(--color-soft-border)] bg-white p-2 text-[var(--color-stone)]" onClick={onCancel} type="button">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-6">
          <label className="grid gap-2 text-sm font-semibold">
            <span>반려사유</span>
            <textarea
              className="min-h-28 rounded-lg border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm"
              onChange={(event) => onChange(event.target.value)}
              value={reason}
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--color-soft-border)] px-6 py-4">
          <Button className="rounded-full" onClick={onCancel} variant="outline">
            취소
          </Button>
          <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" disabled={!reason.trim()} onClick={onSubmit}>
            반려 처리
          </Button>
        </div>
      </section>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
      <p className="text-sm font-semibold text-[var(--color-stone)]">{label}</p>
      <p className="mt-3 text-2xl font-bold">{value}</p>
    </div>
  );
}
