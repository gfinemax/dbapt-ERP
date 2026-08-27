"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import { formatExpenseResolutionAmount } from "./expense-resolution-data";
import {
  ExpenseResolutionDetailModal,
} from "./expense-resolution-page";
import type { ManagedExpenseResolution } from "./expense-resolution-page";
import { transitionExpenseApproval, type ApprovalTransitionRequest } from "./expense-approval-workflow";

const today = "2026-07-02";
const currentApprover = {
  name: "오학동",
  role: "사무국장",
};
const currentApproverLabel = `${currentApprover.name} ${currentApprover.role}`;

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

export function ExpenseApprovalInboxPage({ dataLoadError, initialResolutions, transitionApproval }: { dataLoadError?: string; initialResolutions?: ManagedExpenseResolution[]; transitionApproval?: (input: ApprovalTransitionRequest) => Promise<ManagedExpenseResolution> } = {}) {
  const [resolutions, setResolutions] = useState<ManagedExpenseResolution[]>(() => initialResolutions ?? []);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [workflowError, setWorkflowError] = useState("");
  const selectedDetail = selectedDetailId ? resolutions.find((resolution) => resolution.id === selectedDetailId) : undefined;
  const rejectTarget = rejectTargetId ? resolutions.find((resolution) => resolution.id === rejectTargetId) : undefined;

  const summary = useMemo(() => {
    const myPending = resolutions.filter((resolution) => resolution.currentApprover === currentApproverLabel && resolution.approvalStatus === "승인대기");
    const finalApprovalWaiting = resolutions.filter((resolution) => resolution.currentApprover === "안동연 조합장" && resolution.approvalStatus === "승인대기");

    return {
      myPendingCount: myPending.length,
      completedTodayCount: resolutions.filter((resolution) => resolution.approvalStatus === "승인완료" && resolution.createdAt === today).length,
      rejectedCount: resolutions.filter((resolution) => resolution.approvalStatus === "반려").length,
      finalWaitingAmount: finalApprovalWaiting.reduce((sum, resolution) => sum + resolution.totalPaymentAmount, 0),
    };
  }, [resolutions]);

  async function runTransition(resolution: ManagedExpenseResolution, command: "APPROVE" | "REJECT", reason?: string) {
    setWorkflowError("");
    try {
      const transitioned = transitionApproval
        ? await transitionApproval({ actorLabel: currentApproverLabel, command, expectedCurrentApprover: resolution.currentApprover, expectedStatus: resolution.approvalStatus, reason, resolutionId: resolution.id })
        : transitionExpenseApproval({ actorLabel: currentApproverLabel, command, reason, resolution, transitionedAt: `${today} 14:20` });
      setResolutions((current) => current.map((item) => item.id === transitioned.id ? transitioned : item));
      return true;
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : "결재 상태를 변경하지 못했습니다.");
      return false;
    }
  }

  async function approveResolution(id: string) {
    const resolution = resolutions.find((item) => item.id === id);
    if (resolution) await runTransition(resolution, "APPROVE");
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

  return (
    <ErpShell activeDetailLabel="결재함" activeLabel="회계/자금" activeWorkspaceLabel="전표·증빙관리">
      {dataLoadError ? <div className="mx-auto mb-4 max-w-[1480px] rounded-xl border border-[var(--color-tangerine)]/30 bg-[var(--color-sunset-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-tangerine)]" role="alert">{dataLoadError}</div> : null}
      {workflowError ? <div className="mx-auto mb-4 max-w-[1480px] rounded-xl border border-[var(--color-tangerine)]/30 bg-[var(--color-sunset-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-tangerine)]" role="alert">{workflowError}</div> : null}
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6">
        <section className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 lg:p-7">
          <p className="mb-3 inline-flex rounded-full bg-[var(--color-morning-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]">
            회계/자금 &gt; 전표·증빙관리 &gt; 결재함
          </p>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-normal">결재함</h1>
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
          <SummaryTile label="오늘 결재완료" value={`${summary.completedTodayCount}건`} />
          <SummaryTile label="반려 문서" value={`${summary.rejectedCount}건`} />
          <SummaryTile label="최종승인 대기금액" value={formatExpenseResolutionAmount(summary.finalWaitingAmount)} />
        </section>

        <section className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-2 rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2.5 text-sm text-[var(--color-fog)] xl:w-[430px]">
              <Search className="size-4 shrink-0" />
              <span>결의서번호, 작성자, 거래처, 현재결재자 검색</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {["전체", "내 결재대기", "결재완료", "반려", "최종승인대기", "지급대기"].map((filter) => (
                <button
                  className="rounded-full border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--color-stone)] first:bg-[var(--color-pressed-charcoal)] first:text-white"
                  key={filter}
                  type="button"
                >
                  {filter}
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
                {resolutions.map((resolution) => {
                  const canApprove = resolution.approvalStatus === "승인대기" && resolution.currentApprover === currentApproverLabel;

                  return (
                    <tr className="bg-white/70" key={resolution.id}>
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
          canApprove={selectedDetail.currentApprover === currentApproverLabel}
          onApprove={() => approveResolution(selectedDetail.id)}
          onClose={() => setSelectedDetailId(null)}
          onConfirmVoucher={() => undefined}
          onCreateVoucher={() => undefined}
          onPrintArchive={() => undefined}
          onPrintPreview={() => undefined}
          onProcessPayment={() => undefined}
          onReject={() => openRejectModal(selectedDetail.id)}
          onRequestApproval={() => undefined}
          resolution={selectedDetail}
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
    </ErpShell>
  );
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
