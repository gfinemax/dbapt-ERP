"use client";

import { useState, useTransition } from "react";
import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import type { BankTransactionResolutionCandidate } from "./expense-compliance-repository";
import type { CorporateCardTransactionCandidate } from "./corporate-card-transaction";
import type { QuickExpenseRecord, QuickExpenseRecordInput, QuickExpensePaymentMethod } from "./quick-expense-record";

const paymentLabels: Record<QuickExpensePaymentMethod, string> = { AUTO_DEBIT: "자동이체", BANK_TRANSFER: "계좌이체", CASH: "현금", CORPORATE_CARD: "법인카드", PERSONAL_PREPAID: "개인 선결제" };
const budgetSuggestions = ["운영비 > 통신비", "운영비 > 여비교통비", "운영비 > 사무용품비", "운영비 > 지급수수료", "운영비 > 기타"];

export function QuickExpensePage({ initialBankTransactions, initialCardTransactions, initialRecords, persistRecord }: {
  initialBankTransactions: BankTransactionResolutionCandidate[];
  initialCardTransactions: CorporateCardTransactionCandidate[];
  initialRecords: QuickExpenseRecord[];
  persistRecord?: (input: QuickExpenseRecordInput) => Promise<QuickExpenseRecord>;
}) {
  const [paymentMethod, setPaymentMethod] = useState<QuickExpensePaymentMethod>("BANK_TRANSFER");
  const [sourceId, setSourceId] = useState("");
  const [usageDescription, setUsageDescription] = useState("");
  const [budgetItem, setBudgetItem] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualCounterparty, setManualCounterparty] = useState("");
  const [records, setRecords] = useState(initialRecords);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const isBank = paymentMethod === "BANK_TRANSFER" || paymentMethod === "AUTO_DEBIT";
  const isCard = paymentMethod === "CORPORATE_CARD";
  const bank = initialBankTransactions.find((item) => item.id === sourceId);
  const card = initialCardTransactions.find((item) => item.id === sourceId);
  const amount = bank?.withdrawalAmount ?? card?.amount ?? Number(manualAmount);
  const counterparty = bank ? bank.counterparty || bank.description : card?.merchantName ?? manualCounterparty;
  const occurredAt = bank?.transactedAt ?? card?.approvedAt ?? new Date().toISOString();

  function submit() {
    if (!persistRecord) return setMessage("저장소가 연결되지 않아 사용내용을 저장할 수 없습니다.");
    const sourceType = isBank ? "BANK_TRANSACTION" as const : isCard ? "CORPORATE_CARD" as const : "MANUAL" as const;
    startTransition(async () => {
      try {
        const saved = await persistRecord({ amount, approvalSkipReason: paymentMethod === "AUTO_DEBIT" ? "정기·반복 지출" : "승인 예산 내 일상 지출", bankTransactionId: isBank ? sourceId : undefined, budgetItem, corporateCardTransactionId: isCard ? sourceId : undefined, counterparty, evidenceStatus: isCard || paymentMethod === "CASH" ? "QUALIFIED" : "GENERAL", occurredAt, paymentMethod, recordedByLabel: "오학동 사무장", sourceType, usageDescription });
        setRecords((current) => [saved, ...current]);
        setUsageDescription(""); setBudgetItem(""); setSourceId(""); setManualAmount(""); setManualCounterparty("");
        setMessage(saved.recordStatus === "RECORDED" ? "지출결의 없이 사용내용을 등록했어." : "정식 지출결의가 필요한 거래로 분류했어.");
      } catch (error) { setMessage(error instanceof Error ? error.message : "사용내용을 저장하지 못했습니다."); }
    });
  }

  return <ErpShell activeDetailLabel="예산 내 간편지출" activeLabel="회계/자금" activeWorkspaceLabel="전표·증빙관리"><div className="mx-auto grid max-w-[1180px] gap-6">
    <section className="rounded-2xl border border-[var(--color-soft-border)] bg-white p-6"><p className="text-xs font-bold text-[var(--color-deep-cobalt)]">회계/자금 &gt; 전표·증빙관리</p><h1 className="mt-2 text-3xl font-bold">예산 내 간편지출</h1><p className="mt-2 text-sm text-[var(--color-stone)]">정식 지출결의서를 만들지 않고 실제 거래에 사용내용과 예산항목을 기록합니다. 한도초과·계약·예산 외 거래는 자동으로 정식 결의 대상으로 분류합니다.</p></section>
    <section className="grid gap-5 rounded-2xl border border-[var(--color-soft-border)] bg-white p-6">
      <fieldset><legend className="text-sm font-bold">결제수단</legend><div className="mt-3 flex flex-wrap gap-2">{(Object.keys(paymentLabels) as QuickExpensePaymentMethod[]).map((method) => <button aria-pressed={paymentMethod === method} className={`rounded-full border px-4 py-2 text-sm font-bold ${paymentMethod === method ? "border-[var(--color-deep-cobalt)] bg-[var(--color-morning-tint)]" : "border-[var(--color-soft-border)]"}`} key={method} onClick={() => { setPaymentMethod(method); setSourceId(""); }} type="button">{paymentLabels[method]}</button>)}</div></fieldset>
      {isBank ? <label className="grid gap-2 text-sm font-bold"><span>미처리 통장 출금거래</span><select className="h-11 rounded-lg border px-3" onChange={(event) => setSourceId(event.target.value)} value={sourceId}><option value="">거래 선택</option>{initialBankTransactions.filter((item) => !item.linkedResolutionId && !records.some((record) => record.bankTransactionId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.transactedAt.slice(0,10)} · {item.withdrawalAmount.toLocaleString("ko-KR")}원 · {item.counterparty || item.description}</option>)}</select></label> : null}
      {isCard ? <label className="grid gap-2 text-sm font-bold"><span>미처리 법인카드 승인내역</span><select className="h-11 rounded-lg border px-3" onChange={(event) => setSourceId(event.target.value)} value={sourceId}><option value="">거래 선택</option>{initialCardTransactions.filter((item) => !item.linkedResolutionId && !records.some((record) => record.corporateCardTransactionId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.approvedAt.slice(0,10)} · {item.amount.toLocaleString("ko-KR")}원 · {item.merchantName}</option>)}</select></label> : null}
      {!isBank && !isCard ? <div className="grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm font-bold"><span>금액</span><input className="h-11 rounded-lg border px-3" inputMode="numeric" onChange={(event) => setManualAmount(event.target.value.replace(/\D/g, ""))} value={manualAmount} /></label><label className="grid gap-2 text-sm font-bold"><span>거래처·지급대상</span><input className="h-11 rounded-lg border px-3" onChange={(event) => setManualCounterparty(event.target.value)} value={manualCounterparty} /></label></div> : null}
      <label className="grid gap-2 text-sm font-bold"><span>사용내용</span><textarea className="min-h-24 rounded-lg border p-3" onChange={(event) => setUsageDescription(event.target.value)} placeholder="예: 조합 사무실 인터넷 요금" value={usageDescription} /></label>
      <label className="grid gap-2 text-sm font-bold"><span>예산항목</span><input className="h-11 rounded-lg border px-3" list="quick-expense-budget-items" onChange={(event) => setBudgetItem(event.target.value)} placeholder="예산항목 선택 또는 입력" value={budgetItem} /><datalist id="quick-expense-budget-items">{budgetSuggestions.map((item) => <option key={item} value={item} />)}</datalist></label>
      <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--color-cloud-veil)] p-4"><p className="text-sm font-bold">{amount > 0 ? `${counterparty || "거래처 미입력"} · ${amount.toLocaleString("ko-KR")}원` : "거래와 사용내용을 입력해줘."}</p><Button disabled={isPending || !(amount > 0) || !usageDescription.trim() || !budgetItem.trim() || ((isBank || isCard) && !sourceId)} onClick={submit}>{isPending ? "저장 중" : "사용내용 등록"}</Button></div>
      {message ? <p aria-live="polite" className="rounded-lg bg-[var(--color-morning-tint)] px-4 py-3 text-sm font-bold text-[var(--color-deep-cobalt)]">{message}</p> : null}
    </section>
    <section className="rounded-2xl border border-[var(--color-soft-border)] bg-white p-6"><h2 className="text-lg font-bold">최근 간편지출 기록</h2><div className="mt-4 grid gap-3">{records.length ? records.map((record) => <article className="rounded-xl border p-4" key={record.id}><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold">{record.usageDescription}</p><span className="rounded-full bg-[var(--color-sprout)] px-3 py-1 text-xs font-bold text-[var(--color-green-ink)]">{record.recordStatus === "RECORDED" ? "간편처리 완료" : "정식결의 필요"}</span></div><p className="mt-2 text-sm text-[var(--color-stone)]">{record.counterparty} · {record.amount.toLocaleString("ko-KR")}원 · {record.budgetItem}</p></article>) : <p className="text-sm text-[var(--color-stone)]">등록된 간편지출이 없습니다.</p>}</div></section>
  </div></ErpShell>;
}
