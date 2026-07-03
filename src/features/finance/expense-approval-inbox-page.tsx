"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import { expenseResolutions, formatExpenseResolutionAmount } from "./expense-resolution-data";
import type { ExpenseResolution } from "./expense-resolution-data";
import {
  buildApprovalLine,
  buildExpenseResolutionHistory,
  createHistoryItem,
  ExpenseResolutionDetailModal,
  getApproverLabel,
  toApprovalStatus,
  toManagedExpenseResolution,
  toPaymentStatus,
} from "./expense-resolution-page";
import type { ManagedExpenseResolution } from "./expense-resolution-page";

const today = "2026-07-02";
const currentApprover = {
  name: "오학동",
  role: "사무장",
};
const currentApproverLabel = `${currentApprover.name} ${currentApprover.role}`;

const approvalInboxSeeds = [
  {
    source: expenseResolutions[0],
    override: {
      id: "approval-inbox-0101",
      resolutionNo: "지결-2026-0101",
      createdAt: "2026-07-01",
      author: "장현제 부장",
      vendorName: "한빛전기안전",
      expenseType: "용역비" as const,
      budgetItem: "운영비 > 안전점검",
      supplyAmount: 3000000,
      vat: 300000,
      totalPaymentAmount: 3300000,
      currentApprover: currentApproverLabel,
      paymentStatus: "지급전" as const,
      reason: "조합 사무실 및 홍보관 전기안전 점검 용역비 지급",
    },
  },
  {
    source: expenseResolutions[1],
    override: {
      id: "approval-inbox-0102",
      resolutionNo: "지결-2026-0102",
      createdAt: "2026-07-01",
      author: "사무국 관리자",
      vendorName: "대방측량기술",
      expenseType: "토지매입비" as const,
      budgetItem: "사업비 > 토지비",
      supplyAmount: 4500000,
      vat: 0,
      totalPaymentAmount: 4500000,
      currentApprover: currentApproverLabel,
      paymentStatus: "지급전" as const,
      reason: "사업부지 경계측량 관련 토지매입 부대비 지급",
    },
  },
  {
    source: expenseResolutions[2],
    override: {
      id: "approval-inbox-0103",
      resolutionNo: "지결-2026-0103",
      createdAt: "2026-07-02",
      author: "회계담당자",
      vendorName: "미래세무회계",
      expenseType: "세무비" as const,
      budgetItem: "운영비 > 세무자문",
      supplyAmount: 2200000,
      vat: 220000,
      totalPaymentAmount: 2420000,
      currentApprover: currentApproverLabel,
      paymentStatus: "지급전" as const,
      reason: "부가세 예정신고 검토 및 조합 회계 자문료 지급",
    },
  },
  {
    source: expenseResolutions[3],
    override: {
      id: "approval-inbox-0104",
      resolutionNo: "지결-2026-0104",
      createdAt: "2026-07-02",
      author: "오학동 사무장",
      vendorName: "법무법인 정담",
      expenseType: "법무비" as const,
      budgetItem: "운영비 > 법무자문",
      supplyAmount: 12000000,
      vat: 300000,
      totalPaymentAmount: 12300000,
      currentApprover: "안동연 조합장",
      paymentStatus: "지급전" as const,
      reason: "총회 의결 효력 검토 및 대관 대응 법률자문료 지급",
    },
  },
  {
    source: expenseResolutions[4],
    override: {
      id: "approval-inbox-0105",
      resolutionNo: "지결-2026-0105",
      createdAt: "2026-07-02",
      author: "오학동 사무장",
      vendorName: "대방사무용품",
      expenseType: "운영비" as const,
      budgetItem: "운영비 > 사무관리",
      supplyAmount: 900000,
      vat: 90000,
      totalPaymentAmount: 990000,
      currentApprover: undefined,
      approvalStatus: "승인완료" as const,
      paymentStatus: "지급대기" as const,
      reason: "사무국 복합기 토너 및 소모품 구입비 지급",
    },
  },
  {
    source: expenseResolutions[4],
    override: {
      id: "approval-inbox-0106",
      resolutionNo: "지결-2026-0106",
      createdAt: "2026-06-30",
      author: "회계담당자",
      vendorName: "박서연 조합원",
      expenseType: "환불금" as const,
      budgetItem: "조합원 정산 > 환불금",
      supplyAmount: 1500000,
      vat: 0,
      totalPaymentAmount: 1500000,
      currentApprover: undefined,
      approvalStatus: "반려" as const,
      paymentStatus: "지급전" as const,
      rejectionReason: "환불계좌 확인서 보완 필요",
      reason: "계약 해지 조합원 환불금 지급 검토",
    },
  },
];

function buildInboxResolution(source: ExpenseResolution, override: Partial<ManagedExpenseResolution>): ManagedExpenseResolution {
  const baseResolution = toManagedExpenseResolution(source);
  const approvalLine = buildApprovalLine().map((step) =>
    step.order === 1 || (override.currentApprover === "안동연 조합장" && step.order <= 2)
      ? { ...step, status: "승인완료" as const, processedAt: today }
      : step,
  );

  const resolution = {
    ...baseResolution,
    ...override,
    approvalLine,
    approvalStatus: override.approvalStatus ?? toApprovalStatus(source.approvalStatus),
    paymentStatus: override.paymentStatus ?? toPaymentStatus(source.paymentStatus),
  };

  return {
    ...resolution,
    history: override.history ?? buildExpenseResolutionHistory(resolution),
  };
}

function createInboxResolutions() {
  return approvalInboxSeeds.map((seed) => buildInboxResolution(seed.source, seed.override));
}

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

export function ExpenseApprovalInboxPage() {
  const [resolutions, setResolutions] = useState<ManagedExpenseResolution[]>(createInboxResolutions);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
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

  function approveResolution(id: string) {
    setResolutions((current) =>
      current.map((resolution) => {
        if (resolution.id !== id || resolution.approvalStatus !== "승인대기" || resolution.currentApprover !== currentApproverLabel) {
          return resolution;
        }

        const currentStepIndex = resolution.approvalLine.findIndex((step) => getApproverLabel(step) === resolution.currentApprover);
        const approvedStep = resolution.approvalLine[currentStepIndex];
        const approvedActorLabel = getApproverLabel(approvedStep);
        const approvalLine = resolution.approvalLine.map((step, index) =>
          index === currentStepIndex ? { ...step, status: "승인완료" as const, processedAt: today } : step,
        );
        const nextStep = approvalLine[currentStepIndex + 1];
        const approvalHistory = createHistoryItem({
          actionAt: "2026-07-02 14:20",
          actionLabel: "결재승인",
          actionType: "APPROVED",
          actorLabel: currentApproverLabel,
          comment: `${approvedActorLabel} 승인`,
        });

        if (!nextStep) {
          return {
            ...resolution,
            approvalLine,
            approvalStatus: "승인완료",
            currentApprover: undefined,
            history: [
              ...resolution.history,
              approvalHistory,
              createHistoryItem({
                actionAt: "2026-07-03 09:31",
                actionLabel: "지급대기 전환",
                actionType: "PAYMENT_PENDING",
                actorLabel: "시스템",
              }),
            ],
            paymentStatus: "지급대기",
          };
        }

        return {
          ...resolution,
          approvalLine,
          currentApprover: getApproverLabel(nextStep),
          history: [...resolution.history, approvalHistory],
        };
      }),
    );
  }

  function openRejectModal(id: string) {
    setRejectTargetId(id);
    setRejectionReason("");
  }

  function closeRejectModal() {
    setRejectTargetId(null);
    setRejectionReason("");
  }

  function rejectResolution() {
    const reason = rejectionReason.trim();
    if (!rejectTargetId || !reason) {
      return;
    }

    setResolutions((current) =>
      current.map((resolution) =>
        resolution.id === rejectTargetId
          ? {
              ...resolution,
              approvalLine: resolution.approvalLine.map((step) =>
                getApproverLabel(step) === resolution.currentApprover ? { ...step, status: "반려" as const, processedAt: today } : step,
              ),
              approvalStatus: "반려",
              currentApprover: undefined,
              history: [
                ...resolution.history,
                createHistoryItem({
                  actionAt: "2026-07-02 16:20",
                  actionLabel: "반려",
                  actionType: "REJECTED",
                  actorLabel: resolution.currentApprover ?? currentApproverLabel,
                  comment: reason,
                }),
              ],
              paymentStatus: "지급전",
              rejectionReason: reason,
            }
          : resolution,
      ),
    );
    closeRejectModal();
  }

  return (
    <ErpShell activeDetailLabel="결재함" activeLabel="회계/자금" activeWorkspaceLabel="전표·증빙관리">
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
