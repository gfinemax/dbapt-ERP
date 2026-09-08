import type { ExpenseWorkspace } from "./expense-workspace-repository";
import type { PaymentWorkspace } from "./fund-payment-repository";
import type { TrustReadResult } from "./fund-trust-repository";
import type { AccountingWorkspace } from "./accounting-workspace-repository";
import { paymentRows } from "./fund-payment-domain";

export const financeTaskLabels = {
  MY_APPROVAL: "내가 결재할 기안",
  UNCONNECTED: "지출 원본 연결",
  APPROVAL: "승인대기 지출",
  TRUST_READY: "신탁 요청 준비",
  TRUST_SUPPLEMENT: "신탁 보완·재검토",
  PAYABLE: "지급 가능",
  PAYMENT_REVIEW: "지급 근거 확인",
  ACCOUNTING_REVIEW: "회계 초안 검토",
  SETTLEMENT_OVERDUE: "정산 기한 경과",
  EVIDENCE_REVIEW: "증빙 보완 필요",
  BANK_UNMATCHED: "미매칭 계좌 거래",
} as const;
export type FinanceTaskKind = keyof typeof financeTaskLabels;
export type FinanceTask = { id: string; kind: FinanceTaskKind; title: string; detail: string; href: string };
export type FinanceTaskWorkspace = { tasks: FinanceTask[]; unavailable: { kind: FinanceTaskKind; message: string }[]; staff: boolean };
export type FinanceTaskInputs = { expenses?: ExpenseWorkspace; payments?: PaymentWorkspace; trust?: TrustReadResult; accounting?: AccountingWorkspace };

export function financeTasks(input: FinanceTaskInputs): FinanceTask[] {
  const tasks: FinanceTask[] = [];
  for (const row of input.expenses?.records ?? []) {
    const href = `/finance/expenses?source_kind=${encodeURIComponent(row.source_kind)}&source_id=${encodeURIComponent(row.source_id)}`;
    const id = `${row.source_kind}:${row.source_id}`;
    if (!row.transaction_id && row.can_connect) tasks.push({ id: `connect:${id}`, kind: "UNCONNECTED", title: row.title, detail: "기존 원본을 신탁·지급·회계 업무에 연결", href });
    if (["승인대기", "SUBMITTED"].includes(row.approval_status)) tasks.push({ id: `approval:${id}`, kind: "APPROVAL", title: row.title, detail: "원본의 승인대기 상태 · 담당 결재자는 원본에서 확인", href });
  }
  for (const request of input.trust?.requests ?? []) {
    const items = input.trust!.items.filter(item => item.request_id === request.id && (item.status === "SUPPLEMENT" || item.needs_review));
    if (items.length) tasks.push({ id: `trust:${request.id}`, kind: "TRUST_SUPPLEMENT", title: `${request.request_no} · ${request.title}`, detail: `보완·재검토 항목 ${items.length}건`, href: `/finance/trust?request=${encodeURIComponent(request.id)}` });
  }
  const paymentReviewIds = new Set(input.payments ? paymentRows(input.payments, "REVIEW", "").map(row => row.id) : []);
  for (const row of input.payments?.transactions ?? []) {
    const eligible = input.payments!.eligibility.find(e => e.transaction_id === row.id);
    if (eligible && eligible.available > 0) tasks.push({ id: `pay:${row.id}`, kind: "PAYABLE", title: row.title, detail: `현재 지급 가능 ${eligible.available.toLocaleString("ko-KR")}원 · 실행 시 재검증`, href: `/finance/payments?tab=READY&q=${encodeURIComponent(row.title)}` });
    if (paymentReviewIds.has(row.id)) tasks.push({ id: `payment-review:${row.id}`, kind: "PAYMENT_REVIEW", title: row.title, detail: "기존 지급 사실·금액 확인 필요", href: `/finance/payments?tab=REVIEW&q=${encodeURIComponent(row.title)}` });
  }
  for (const voucher of input.accounting?.vouchers ?? []) {
    if (voucher.managed) tasks.push({ id: `voucher:${voucher.id}`, kind: "ACCOUNTING_REVIEW", title: voucher.voucher_no, detail: voucher.source_stale ? "연결 원본 변경 · 최신 원본 재검토" : "회계 초안 · 확정 정책 확인 전", href: `/finance?voucherId=${encodeURIComponent(voucher.id)}` });
  }
  for (const source of input.accounting?.sources ?? []) {
    if (!source.existing_voucher_id) tasks.push({ id: `accounting:${source.kind}:${source.id}`, kind: "ACCOUNTING_REVIEW", title: source.title, detail: source.blocked_reason || "전표 미연결 · 회계 화면에서 원본 선택", href: "/finance" });
  }
  return tasks;
}
