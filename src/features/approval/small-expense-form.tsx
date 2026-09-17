"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { accountSubjectRecommendations } from "@/features/basic-info/account-subject-data";
import { recommendSmallExpenseAccount } from "./small-expense-account";
import type { SmallExpense, SmallExpenseBudget, SmallExpenseMember, SmallExpenseSource } from "./small-expense-domain";

const input = "w-full rounded-xl border border-[var(--color-soft-border)] px-3 py-2 text-sm";
const accountNames = [...new Set([...accountSubjectRecommendations.filter(item => item.subjectType === "지출").map(item => item.name), "지급임차료", "기타운영비"])];

export function SmallExpenseForm({ limit, action, members = [], budgets = [], sources = [], userId, month, initial }: {
  limit: number; action: (data: FormData) => Promise<void>; members?: SmallExpenseMember[]; budgets?: SmallExpenseBudget[];
  sources?: SmallExpenseSource[]; userId?: string; month?: string; initial?: SmallExpense;
}) {
  const [description, setDescription] = useState(initial?.description ?? "");
  const [manualAccount, setManualAccount] = useState<string | null>(initial?.accountSubjectName ?? null);
  const [id, setId] = useState(() => initial?.id ?? crypto.randomUUID());
  const [method, setMethod] = useState(initial?.paymentMethod ?? "CASH");
  const [budgetOverride, setBudgetOverride] = useState<string | null>(initial?.budgetId ?? null);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const recommended = recommendSmallExpenseAccount(description);
  const account = manualAccount ?? recommended;
  const matchingBudgets = budgets.filter(b => b.budget_item.split(">").at(-1)?.trim() === account);
  const budgetId = budgetOverride ?? (matchingBudgets.length === 1 ? matchingBudgets[0].id : "");

  return <form onSubmit={event => {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setMessage("");
    start(async () => { try { await action(data); form.reset(); setDescription(""); setManualAccount(null); setBudgetOverride(null); setId(crypto.randomUUID()); setMessage("등록했습니다. 조합장이 확인한 뒤 확정합니다."); } catch (error) { setMessage(error instanceof Error ? error.message : "등록하지 못했습니다."); } });
  }} className="grid gap-3 rounded-2xl border border-[var(--color-soft-border)] bg-white p-5 md:grid-cols-3 xl:grid-cols-5">
    <input type="hidden" name="id" value={id} /><input type="hidden" name="revision" value={initial?.revision ?? 0} />
    <input aria-label="사용일" className={input} name="expenseDate" type="date" required defaultValue={initial?.expenseDate} min={month ? `${month}-01` : undefined} max={month ? new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10) : undefined} />
    <input aria-label="거래처" className={input} name="partnerName" placeholder="거래처 (모르면 미확인)" defaultValue={initial?.partnerName} />
    <input aria-label="사용내용" className={input} name="description" placeholder="사용내용" required value={description} onChange={event => setDescription(event.target.value)} />
    <input aria-label="프로젝트" className={input} name="projectName" placeholder="프로젝트" defaultValue={initial?.projectName} />
    <div className="space-y-1">
      <input aria-label="계정과목" aria-describedby="small-expense-account-help" className={input} name="accountSubjectName" placeholder="사용내용 입력 시 자동 선택" list="small-expense-accounts" required value={account} onChange={event => setManualAccount(event.target.value)} />
      <datalist id="small-expense-accounts">{accountNames.map(name => <option key={name} value={name} />)}</datalist>
      <p id="small-expense-account-help" role="status" className="text-xs text-[var(--color-stone)]">{manualAccount !== null ? "직접 수정한 계정과목을 사용합니다." : recommended ? "사용내용으로 자동 선택했습니다. 수정할 수 있습니다." : description.trim() ? "자동 분류가 어려워요. 계정과목을 선택하거나 입력해 주세요." : "사용내용을 입력하면 계정과목을 자동 선택합니다."}</p>
      {manualAccount !== null ? <button type="button" className="text-xs underline" onClick={() => setManualAccount(null)}>자동 선택으로 되돌리기</button> : null}
    </div>
    <label className="text-sm">예산항목<select aria-label="예산항목" className={input} name="budgetId" value={budgetId} onChange={e => setBudgetOverride(e.target.value)} required><option value="">예산항목 선택</option>{budgets.map(b => <option key={b.id} value={b.id}>{b.budget_item}</option>)}</select></label>
    <input aria-label="금액" className={input} max={limit} min="1" name="amount" placeholder="금액" type="number" required defaultValue={initial?.amount} />
    <label className="text-sm">실제 사용자<select aria-label="실제 사용자" className={input} name="spenderId" required defaultValue={initial?.spenderId ?? userId}><option value="">사용자 선택</option>{members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select></label>
    <label className="text-sm">결제수단<select aria-label="결제수단" className={input} name="paymentMethod" value={method} onChange={e => setMethod(e.target.value)}><option value="CASH">조합 현금</option><option value="BANK_TRANSFER">조합 통장</option><option value="CORPORATE_CARD">법인카드</option></select></label>
    {method !== "CASH" ? <label className="text-sm md:col-span-2">실제 거래 연결<select key={method} aria-label="실제 거래 연결" name={method === "BANK_TRANSFER" ? "bankTransactionId" : "cardTransactionId"} className={input} required defaultValue={(method === "BANK_TRANSFER" ? initial?.bankTransactionId : initial?.cardTransactionId) ?? ""}><option value="">금액·사용일이 일치하는 거래 선택</option>{sources.filter(s => s.method === method).map(s => <option value={s.id} key={s.id}>{s.date} · {s.label} · {s.amount.toLocaleString("ko-KR")}원</option>)}</select></label> : null}
    <label className="text-sm">영수증 (3MB 이하)<input aria-label="증빙파일" accept="application/pdf,image/png,image/jpeg,image/webp" className={input} name="evidence" type="file" required={!initial?.hasEvidence} />{initial?.hasEvidence ? <span className="text-xs">파일을 선택하지 않으면 기존 증빙을 유지합니다.</span> : null}</label>
    <input aria-label="비고" className={`${input} md:col-span-2`} name="memo" placeholder="비고" defaultValue={initial?.memo} />
    <button disabled={pending} className="rounded-full bg-[var(--color-pressed-charcoal)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{pending ? "등록 중…" : initial ? "보완 내역 등록" : "내역 등록"}</button>
    <p className="text-sm md:col-span-3 xl:col-span-5">개인 돈으로 결제했다면 <Link className="underline" href="/finance/reimbursements">개인 지출 정산</Link>에서 신청해주세요. 거래처 미확인 건은 확정 전에 보완해야 합니다.</p>
    {message ? <p role="alert" className="text-sm md:col-span-3 xl:col-span-5">{message}</p> : null}
  </form>;
}
