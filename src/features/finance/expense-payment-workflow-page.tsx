"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import { expenseResolutions, formatExpenseResolutionAmount } from "./expense-resolution-data";
import {
  buildApprovalLine,
  buildExpenseResolutionHistory,
  ExpenseResolutionDetailModal,
  getNextExpenseVoucherNo,
  getVoucherStatusLabel,
  toManagedExpenseResolution,
  toPaymentStatus,
} from "./expense-resolution-page";
import type { ManagedExpenseResolution } from "./expense-resolution-page";
import { transitionExpenseDisbursement, type DisbursementTransitionRequest } from "./expense-disbursement-workflow";

type PaymentWorkflowMode = "waiting" | "completed";
type PaymentMethod = "계좌이체" | "카드결제" | "현금" | "기타";

type PaymentFormState = {
  actualPaidAmount: string;
  paidAt: string;
  paymentAccountNo: string;
  paymentMemo: string;
  paymentMethod: PaymentMethod;
};

const today = "2026-07-02";

function buildPaymentResolution(
  sourceIndex: number,
  override: Partial<ManagedExpenseResolution> & Pick<ManagedExpenseResolution, "id" | "resolutionNo" | "vendorName">,
): ManagedExpenseResolution {
  const source = expenseResolutions[sourceIndex];
  const baseResolution = toManagedExpenseResolution(source);
  const approvalLine = buildApprovalLine().map((step) => ({ ...step, status: "승인완료" as const, processedAt: today }));

  const resolution = {
    ...baseResolution,
    ...override,
    approvalLine,
    approvalStatus: override.approvalStatus ?? "승인완료",
    currentApprover: undefined,
    paymentStatus: override.paymentStatus ?? toPaymentStatus(source.paymentStatus),
  };

  return {
    ...resolution,
    history: override.history ?? buildExpenseResolutionHistory(resolution),
  };
}

function createPaymentResolutions(): ManagedExpenseResolution[] {
  if (expenseResolutions.length === 0) {
    return [];
  }

  return [
    buildPaymentResolution(4, {
      id: "payment-waiting-001",
      resolutionNo: "지결-2026-0201",
      createdAt: "2026-07-01",
      plannedPaymentDate: today,
      author: "오학동 사무장",
      vendorName: "대방사무용품",
      expenseType: "운영비",
      budgetItem: "운영비 > 사무관리",
      paymentBank: "우리은행",
      paymentAccountNo: "1002-333-444555",
      accountHolder: "대방사무용품",
      supplyAmount: 900000,
      vat: 90000,
      totalPaymentAmount: 990000,
      reason: "사무국 복합기 토너 및 소모품 구입비 지급",
      approvalStatus: "승인완료",
      paymentStatus: "지급대기",
      evidenceAttached: true,
      evidenceMaterials: ["세금계산서", "견적서"],
    }),
    buildPaymentResolution(0, {
      id: "payment-waiting-002",
      resolutionNo: "지결-2026-0202",
      createdAt: "2026-07-01",
      plannedPaymentDate: "2026-07-03",
      author: "회계담당자",
      vendorName: "법무법인 정담",
      expenseType: "법무비",
      budgetItem: "운영비 > 법무자문",
      paymentBank: "국민은행",
      paymentAccountNo: "123456-78-901234",
      accountHolder: "법무법인 정담",
      supplyAmount: 3000000,
      vat: 300000,
      totalPaymentAmount: 3300000,
      reason: "총회 의결 효력 검토 및 대관 대응 법률자문료 지급",
      approvalStatus: "승인완료",
      paymentStatus: "지급대기",
      evidenceAttached: false,
      evidenceMaterials: ["계약서"],
    }),
    buildPaymentResolution(2, {
      id: "payment-completed-001",
      resolutionNo: "지결-2026-0301",
      createdAt: "2026-06-30",
      plannedPaymentDate: "2026-07-01",
      author: "사무국 관리자",
      vendorName: "미래세무회계",
      expenseType: "세무비",
      budgetItem: "운영비 > 세무자문",
      paymentBank: "하나은행",
      paymentAccountNo: "555-910022-10004",
      accountHolder: "미래세무회계",
      supplyAmount: 2200000,
      vat: 220000,
      totalPaymentAmount: 2420000,
      actualPaidAmount: 2420000,
      paidAt: "2026-07-01",
      paymentMethod: "계좌이체",
      paymentStatus: "지급완료",
      transferReceiptStatus: "이체확인증 첨부 완료",
      evidenceAttached: true,
      evidenceMaterials: ["세금계산서", "이체확인증"],
    }),
    buildPaymentResolution(1, {
      id: "payment-completed-002",
      resolutionNo: "지결-2026-0302",
      createdAt: "2026-06-29",
      plannedPaymentDate: "2026-07-01",
      author: "오학동 사무장",
      vendorName: "대방측량기술",
      expenseType: "토지매입비",
      budgetItem: "사업비 > 토지비",
      paymentBank: "신한은행",
      paymentAccountNo: "110-123-456789",
      accountHolder: "대방측량기술",
      supplyAmount: 4500000,
      vat: 0,
      totalPaymentAmount: 4500000,
      actualPaidAmount: 4500000,
      paidAt: "2026-07-01",
      paymentMethod: "계좌이체",
      paymentStatus: "지급완료",
      transferReceiptStatus: "이체확인증 첨부 대기",
      evidenceAttached: false,
      evidenceMaterials: ["계약서"],
      voucherNo: "지출-2026-0002",
      voucherGenerated: true,
      voucherStatus: "전표초안",
    }),
  ];
}

function Badge({ value }: { value: string }) {
  const classes: Record<string, string> = {
    승인완료: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
    지급대기: "bg-[var(--color-lilac-mist)] text-[var(--color-amethyst)]",
    지급완료: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
    보류: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
    미생성: "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]",
    전표초안: "bg-[var(--color-morning-tint)] text-[var(--color-deep-cobalt)]",
    전표확정: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
    첨부완료: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
    미첨부: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
  };

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${classes[value] ?? classes.지급대기}`}>{value}</span>;
}

export function ExpensePaymentWorkflowPage({ dataLoadError, initialMode, initialResolutions, transitionDisbursement }: {
  dataLoadError?: string;
  initialMode: PaymentWorkflowMode;
  initialResolutions?: ManagedExpenseResolution[];
  transitionDisbursement?: (input: DisbursementTransitionRequest) => Promise<ManagedExpenseResolution>;
}) {
  const [mode, setMode] = useState<PaymentWorkflowMode>(initialMode);
  const [resolutions, setResolutions] = useState<ManagedExpenseResolution[]>(() => initialResolutions ?? createPaymentResolutions());
  const [transitionError, setTransitionError] = useState("");
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const [paymentTargetId, setPaymentTargetId] = useState<string | null>(null);
  const [holdTargetId, setHoldTargetId] = useState<string | null>(null);
  const [holdReason, setHoldReason] = useState("");
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>({
    actualPaidAmount: "0",
    paidAt: today,
    paymentAccountNo: "",
    paymentMemo: "",
    paymentMethod: "계좌이체",
  });

  const selectedDetail = selectedDetailId ? resolutions.find((resolution) => resolution.id === selectedDetailId) : undefined;
  const paymentTarget = paymentTargetId ? resolutions.find((resolution) => resolution.id === paymentTargetId) : undefined;
  const holdTarget = holdTargetId ? resolutions.find((resolution) => resolution.id === holdTargetId) : undefined;
  const waitingResolutions = resolutions.filter(
    (resolution) => resolution.approvalStatus === "승인완료" && (resolution.paymentStatus === "지급대기" || resolution.paymentStatus === "보류"),
  );
  const completedResolutions = resolutions.filter((resolution) => resolution.paymentStatus === "지급완료");
  const visibleResolutions = mode === "waiting" ? waitingResolutions : completedResolutions;

  const summary = useMemo(() => {
    if (mode === "waiting") {
      return [
        { label: "지급대기 건수", value: `${waitingResolutions.length}건` },
        { label: "지급대기 금액", value: formatExpenseResolutionAmount(waitingResolutions.reduce((sum, resolution) => sum + resolution.totalPaymentAmount, 0)) },
        { label: "오늘 지급예정", value: `${waitingResolutions.filter((resolution) => resolution.plannedPaymentDate === today).length}건` },
        { label: "증빙 미첨부", value: `${waitingResolutions.filter((resolution) => !resolution.evidenceAttached).length}건` },
      ];
    }

    return [
      { label: "지급완료 건수", value: `${completedResolutions.length}건` },
      { label: "지급완료 금액", value: formatExpenseResolutionAmount(completedResolutions.reduce((sum, resolution) => sum + (resolution.actualPaidAmount ?? resolution.totalPaymentAmount), 0)) },
      { label: "전표확정 대기", value: `${completedResolutions.filter((resolution) => getVoucherStatusLabel(resolution) !== "전표확정").length}건` },
      { label: "이체확인증 미첨부", value: `${completedResolutions.filter((resolution) => !resolution.transferReceiptStatus?.includes("완료")).length}건` },
    ];
  }, [completedResolutions, mode, waitingResolutions]);

  function openPaymentModal(resolution: ManagedExpenseResolution) {
    setPaymentTargetId(resolution.id);
    setPaymentForm({
      actualPaidAmount: String(resolution.totalPaymentAmount),
      paidAt: today,
      paymentAccountNo: resolution.paymentAccountNo,
      paymentMemo: "",
      paymentMethod: "계좌이체",
    });
  }

  function updatePaymentForm<K extends keyof PaymentFormState>(key: K, value: PaymentFormState[K]) {
    setPaymentForm((current) => ({ ...current, [key]: value }));
  }

  async function runTransition(resolution: ManagedExpenseResolution, command: DisbursementTransitionRequest["command"], extra: Partial<DisbursementTransitionRequest> = {}) {
    setTransitionError("");
    try {
      const request = { actorLabel: "사무국 관리자", command, expectedPaymentStatus: resolution.paymentStatus, expectedVoucherStatus: resolution.voucherStatus, idempotencyKey: crypto.randomUUID(), resolutionId: resolution.id, ...extra } as DisbursementTransitionRequest;
      const changed = transitionDisbursement
        ? await transitionDisbursement(request)
        : transitionExpenseDisbursement({ ...request, resolution, voucherNo: command === "VOUCHER_CREATE" ? getNextExpenseVoucherNo(resolutions) : undefined });
      setResolutions((current) => current.map((item) => item.id === changed.id ? changed : item));
      return changed;
    } catch (error) {
      setTransitionError(error instanceof Error ? error.message : "지급 처리에 실패했습니다.");
      return null;
    }
  }

  async function completePayment() {
    if (!paymentTargetId) {
      return;
    }

    const resolution = resolutions.find((item) => item.id === paymentTargetId);
    if (!resolution || !await runTransition(resolution, "PAYMENT_COMPLETE", { actualPaidAmount: Number(paymentForm.actualPaidAmount) || resolution.totalPaymentAmount, paidAt: paymentForm.paidAt, paymentAccountNo: paymentForm.paymentAccountNo, paymentMemo: paymentForm.paymentMemo, paymentMethod: paymentForm.paymentMethod })) return;
    setPaymentTargetId(null);
    setMode("completed");
  }

  async function holdPayment() {
    const reason = holdReason.trim();
    if (!holdTargetId || !reason) {
      return;
    }

    const resolution = resolutions.find((item) => item.id === holdTargetId);
    if (!resolution || !await runTransition(resolution, "PAYMENT_HOLD", { reason })) return;
    setHoldTargetId(null);
    setHoldReason("");
  }

  async function createVoucher(id: string) {
    const resolution = resolutions.find((item) => item.id === id);
    if (resolution) await runTransition(resolution, "VOUCHER_CREATE");
  }

  async function confirmVoucher(id: string) {
    const resolution = resolutions.find((item) => item.id === id);
    if (resolution) await runTransition(resolution, "VOUCHER_CONFIRM");
  }

  const title = mode === "waiting" ? "지급대기" : "지급완료 내역";
  const description =
    mode === "waiting"
      ? "최종 결재가 완료되어 실제 지급 처리가 필요한 지출결의서를 관리합니다."
      : "실제 지급이 완료된 지출결의서와 지출전표 생성 여부를 확인합니다.";

  return (
    <ErpShell activeDetailLabel={title} activeLabel="회계/자금" activeWorkspaceLabel="전표·증빙관리">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6">
        {(dataLoadError || transitionError) ? <div className="rounded-2xl border border-orange-300 bg-orange-50 px-5 py-4 font-semibold text-orange-700">{transitionError || dataLoadError}</div> : null}
        <section className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 lg:p-7">
          <p className="mb-3 inline-flex rounded-full bg-[var(--color-morning-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]">
            회계/자금 &gt; 전표·증빙관리 &gt; {title}
          </p>
          <h1 className="text-3xl font-bold tracking-normal">{title}</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--color-stone)]">{description}</p>
        </section>

        <section className="grid gap-4 lg:grid-cols-4">
          {summary.map((item) => (
            <SummaryTile key={item.label} label={item.label} value={item.value} />
          ))}
        </section>

        <section className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
          <div className="flex min-w-0 items-center gap-2 rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2.5 text-sm text-[var(--color-fog)] xl:w-[460px]">
            <Search className="size-4 shrink-0" />
            <span>결의서번호, 거래처, 지급은행, 전표번호 검색</span>
          </div>
        </section>

        {mode === "waiting" ? (
          <WaitingPaymentTable
            onHold={(resolution) => {
              setHoldTargetId(resolution.id);
              setHoldReason("");
            }}
            onOpenDetail={(id) => setSelectedDetailId(id)}
            onPayment={openPaymentModal}
            resolutions={visibleResolutions}
          />
        ) : (
          <CompletedPaymentTable
            onConfirmVoucher={confirmVoucher}
            onCreateVoucher={createVoucher}
            onOpenDetail={(id) => setSelectedDetailId(id)}
            resolutions={visibleResolutions}
          />
        )}
      </div>

      {selectedDetail ? (
        <ExpenseResolutionDetailModal
          onApprove={() => undefined}
          onClose={() => setSelectedDetailId(null)}
          onConfirmVoucher={() => confirmVoucher(selectedDetail.id)}
          onCreateVoucher={() => createVoucher(selectedDetail.id)}
          onPrintArchive={() => undefined}
          onPrintPreview={() => undefined}
          onProcessPayment={() => openPaymentModal(selectedDetail)}
          onReject={() => undefined}
          onRequestApproval={() => undefined}
          resolution={selectedDetail}
        />
      ) : null}

      {paymentTarget ? (
        <PaymentProcessModal
          form={paymentForm}
          onCancel={() => setPaymentTargetId(null)}
          onChange={updatePaymentForm}
          onSubmit={completePayment}
          resolution={paymentTarget}
        />
      ) : null}

      {holdTarget ? (
        <HoldReasonModal
          onCancel={() => {
            setHoldTargetId(null);
            setHoldReason("");
          }}
          onChange={setHoldReason}
          onSubmit={holdPayment}
          reason={holdReason}
          resolutionNo={holdTarget.resolutionNo}
        />
      ) : null}
    </ErpShell>
  );
}

function WaitingPaymentTable({
  onHold,
  onOpenDetail,
  onPayment,
  resolutions,
}: {
  onHold: (resolution: ManagedExpenseResolution) => void;
  onOpenDetail: (id: string) => void;
  onPayment: (resolution: ManagedExpenseResolution) => void;
  resolutions: ManagedExpenseResolution[];
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)]">
      <div className="border-b border-[var(--color-soft-border)] p-4">
        <h2 className="text-lg font-bold">지급대기 목록</h2>
      </div>
      <div className="overflow-x-auto">
        <table aria-label="지급대기 목록" className="w-full min-w-[1280px] border-collapse text-left text-sm">
          <thead className="bg-[var(--color-cloud-veil)] text-xs font-semibold text-[var(--color-stone)]">
            <tr>
              <th className="px-4 py-3 text-center">결의서번호</th>
              <th className="px-4 py-3 text-center">지출예정일</th>
              <th className="px-4 py-3 text-center">거래처</th>
              <th className="px-4 py-3 text-center">지출구분</th>
              <th className="px-4 py-3 text-center">지급은행</th>
              <th className="px-4 py-3 text-center">지급계좌</th>
              <th className="px-4 py-3 text-center">예금주</th>
              <th className="px-4 py-3 text-center">총지급액</th>
              <th className="px-4 py-3 text-center">증빙여부</th>
              <th className="px-4 py-3 text-center">액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-soft-border)]">
            {resolutions.map((resolution) => (
              <tr className="bg-white/70" key={resolution.id}>
                <td className="px-4 py-4 font-bold text-[var(--color-deep-cobalt)]">{resolution.resolutionNo}</td>
                <td className="px-4 py-4 text-[var(--color-stone)]">{resolution.plannedPaymentDate}</td>
                <td className="px-4 py-4 font-semibold">{resolution.vendorName}</td>
                <td className="px-4 py-4">{resolution.expenseType}</td>
                <td className="px-4 py-4">{resolution.paymentBank}</td>
                <td className="px-4 py-4">{resolution.paymentAccountNo}</td>
                <td className="px-4 py-4">{resolution.accountHolder}</td>
                <td className="px-4 py-4 text-right font-bold">{formatExpenseResolutionAmount(resolution.totalPaymentAmount)}</td>
                <td className="px-4 py-4">
                  <Badge value={resolution.evidenceAttached ? "첨부완료" : "미첨부"} />
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    <button className="rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-stone)]" onClick={() => onOpenDetail(resolution.id)} type="button">
                      상세보기
                    </button>
                    <button className="rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-green-ink)]" onClick={() => onPayment(resolution)} type="button">
                      지급처리
                    </button>
                    <button className="rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-tangerine)]" onClick={() => onHold(resolution)} type="button">
                      보류
                    </button>
                  </div>
                  {resolution.holdReason ? <p className="mt-1 text-xs text-[var(--color-tangerine)]">{resolution.holdReason}</p> : null}
                  {resolution.paymentStatus === "보류" ? <Badge value="보류" /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CompletedPaymentTable({
  onConfirmVoucher,
  onCreateVoucher,
  onOpenDetail,
  resolutions,
}: {
  onConfirmVoucher: (id: string) => void;
  onCreateVoucher: (id: string) => void;
  onOpenDetail: (id: string) => void;
  resolutions: ManagedExpenseResolution[];
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)]">
      <div className="border-b border-[var(--color-soft-border)] p-4">
        <h2 className="text-lg font-bold">지급완료 내역 목록</h2>
      </div>
      <div className="overflow-x-auto">
        <table aria-label="지급완료 내역 목록" className="w-full min-w-[1280px] border-collapse text-left text-sm">
          <thead className="bg-[var(--color-cloud-veil)] text-xs font-semibold text-[var(--color-stone)]">
            <tr>
              <th className="px-4 py-3 text-center">결의서번호</th>
              <th className="px-4 py-3 text-center">지급일</th>
              <th className="px-4 py-3 text-center">거래처</th>
              <th className="px-4 py-3 text-center">지출구분</th>
              <th className="px-4 py-3 text-center">총지급액</th>
              <th className="px-4 py-3 text-center">실제지급액</th>
              <th className="px-4 py-3 text-center">지급방법</th>
              <th className="px-4 py-3 text-center">지출전표번호</th>
              <th className="px-4 py-3 text-center">전표상태</th>
              <th className="px-4 py-3 text-center">증빙여부</th>
              <th className="px-4 py-3 text-center">액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-soft-border)]">
            {resolutions.map((resolution) => (
              <tr className="bg-white/70" key={resolution.id}>
                <td className="px-4 py-4 font-bold text-[var(--color-deep-cobalt)]">{resolution.resolutionNo}</td>
                <td className="px-4 py-4 text-[var(--color-stone)]">{resolution.paidAt ?? "-"}</td>
                <td className="px-4 py-4 font-semibold">{resolution.vendorName}</td>
                <td className="px-4 py-4">{resolution.expenseType}</td>
                <td className="px-4 py-4 text-right font-bold">{formatExpenseResolutionAmount(resolution.totalPaymentAmount)}</td>
                <td className="px-4 py-4 text-right font-bold">{formatExpenseResolutionAmount(resolution.actualPaidAmount ?? resolution.totalPaymentAmount)}</td>
                <td className="px-4 py-4">{resolution.paymentMethod ?? "-"}</td>
                <td className="px-4 py-4">{resolution.voucherNo ?? "미생성"}</td>
                <td className="px-4 py-4">
                  <Badge value={getVoucherStatusLabel(resolution)} />
                </td>
                <td className="px-4 py-4">
                  <Badge value={resolution.evidenceAttached ? "첨부완료" : "미첨부"} />
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    <button className="rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-stone)]" onClick={() => onOpenDetail(resolution.id)} type="button">
                      상세보기
                    </button>
                    <button
                      className="rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)] disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={Boolean(resolution.voucherNo)}
                      onClick={() => onCreateVoucher(resolution.id)}
                      type="button"
                    >
                      전표초안 생성
                    </button>
                    {resolution.voucherStatus === "전표초안" ? (
                      <button
                        className="rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]"
                        onClick={() => onConfirmVoucher(resolution.id)}
                        type="button"
                      >
                        전표확정
                      </button>
                    ) : null}
                    <button
                      className="rounded-full border border-[var(--color-soft-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-green-ink)] disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={resolution.voucherStatus !== "전표확정"}
                      type="button"
                    >
                      전표보기
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PaymentProcessModal({
  form,
  onCancel,
  onChange,
  onSubmit,
  resolution,
}: {
  form: PaymentFormState;
  onCancel: () => void;
  onChange: <K extends keyof PaymentFormState>(key: K, value: PaymentFormState[K]) => void;
  onSubmit: () => void;
  resolution: ManagedExpenseResolution;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--color-sky-wash)]/88 px-4 py-8" onClick={onCancel}>
      <section
        aria-labelledby="payment-process-title"
        aria-modal="true"
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] shadow-[0_24px_80px_rgba(16,20,24,0.22)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-soft-border)] px-6 py-5">
          <div>
            <h2 className="text-2xl font-bold" id="payment-process-title">
              지급처리
            </h2>
            <p className="mt-2 text-sm text-[var(--color-stone)]">최종 승인된 지출결의서를 실제 지급완료 상태로 처리합니다.</p>
          </div>
          <button aria-label="닫기" className="rounded-full border border-[var(--color-soft-border)] bg-white p-2 text-[var(--color-stone)]" onClick={onCancel} type="button">
            <X className="size-4" />
          </button>
        </div>
        <div className="grid gap-4 p-6 md:grid-cols-2">
          <TextInput label="결의서번호" readOnly value={resolution.resolutionNo} />
          <TextInput label="거래처" readOnly value={resolution.vendorName} />
          <TextInput label="총지급액" readOnly value={String(resolution.totalPaymentAmount)} />
          <TextInput label="지급일" onChange={(value) => onChange("paidAt", value)} type="date" value={form.paidAt} />
          <label className="grid gap-1 text-sm font-semibold">
            <span>지급방법</span>
            <select className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm" onChange={(event) => onChange("paymentMethod", event.target.value as PaymentMethod)} value={form.paymentMethod}>
              {["계좌이체", "카드결제", "현금", "기타"].map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </label>
          <TextInput label="실제지급액" onChange={(value) => onChange("actualPaidAmount", value)} type="number" value={form.actualPaidAmount} />
          <TextInput label="지급계좌" onChange={(value) => onChange("paymentAccountNo", value)} value={form.paymentAccountNo} />
          <label className="grid gap-1 text-sm font-semibold">
            <span>이체확인증 첨부</span>
            <span className="flex h-10 items-center rounded-md border border-dashed border-[var(--color-soft-border)] bg-white px-3 text-xs text-[var(--color-stone)]">
              파일 업로드 UI
            </span>
            <input className="sr-only" type="file" />
          </label>
          <label className="grid gap-1 text-sm font-semibold md:col-span-2">
            <span>지급메모</span>
            <textarea className="min-h-24 rounded-md border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm" onChange={(event) => onChange("paymentMemo", event.target.value)} value={form.paymentMemo} />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--color-soft-border)] px-6 py-4">
          <Button className="rounded-full" onClick={onCancel} variant="outline">
            취소
          </Button>
          <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" onClick={onSubmit}>
            지급완료 처리
          </Button>
        </div>
      </section>
    </div>
  );
}

function HoldReasonModal({
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-sky-wash)]/88 px-4" onClick={onCancel}>
      <section
        aria-labelledby="hold-reason-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] shadow-[0_24px_80px_rgba(16,20,24,0.22)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-soft-border)] px-6 py-5">
          <div>
            <h2 className="text-xl font-bold" id="hold-reason-title">
              보류사유 입력
            </h2>
            <p className="mt-2 text-sm text-[var(--color-stone)]">{resolutionNo} 지급 보류 사유를 입력합니다.</p>
          </div>
          <button aria-label="닫기" className="rounded-full border border-[var(--color-soft-border)] bg-white p-2 text-[var(--color-stone)]" onClick={onCancel} type="button">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-6">
          <label className="grid gap-2 text-sm font-semibold">
            <span>보류사유</span>
            <textarea className="min-h-28 rounded-lg border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm" onChange={(event) => onChange(event.target.value)} value={reason} />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--color-soft-border)] px-6 py-4">
          <Button className="rounded-full" onClick={onCancel} variant="outline">
            취소
          </Button>
          <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" disabled={!reason.trim()} onClick={onSubmit}>
            보류 처리
          </Button>
        </div>
      </section>
    </div>
  );
}

function TextInput({
  label,
  onChange,
  readOnly,
  type = "text",
  value,
}: {
  label: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  type?: "date" | "number" | "text";
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      <span>{label}</span>
      <input
        className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm read-only:bg-[var(--color-cloud-veil)]"
        onChange={(event) => onChange?.(event.target.value)}
        readOnly={readOnly}
        type={type}
        value={value}
      />
    </label>
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
