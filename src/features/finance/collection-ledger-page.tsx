"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { executeCollectionLedger } from "@/app/finance/collections/actions";
import type { CollectionLedgerCommand, CollectionLedgerWorkspace } from "./collection-ledger-repository";
import { CollectionAssessmentImport } from "./collection-assessment-import";

const card = "rounded-2xl border border-slate-200 bg-white p-5";
const input = "min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const primary = "min-h-10 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40";
const secondary = "min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40";
const money = (value: number) => `${Number(value).toLocaleString("ko-KR")}원`;
const statusLabels = { DRAFT: "작성중", APPROVED: "환급 승인", PAID: "지급 완료", CANCELLED: "취소" } as const;

export function CollectionLedgerPage({ workspace, mode }: { workspace: CollectionLedgerWorkspace; mode: "collections" | "refunds" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const permissions = workspace.viewer.permissions;
  const canDecide = permissions.some((permission) => ["ADMIN", "APPROVE", "CLOSE"].includes(permission));
  const canPay = permissions.some((permission) => ["ADMIN", "PAY"].includes(permission));
  const command = (kind: CollectionLedgerCommand, data: Record<string, unknown>) => {
    setMessage("");
    startTransition(async () => {
      try {
        await executeCollectionLedger(kind, data, crypto.randomUUID());
        setMessage("저장했어. 원본과 감사 이력을 유지한 상태로 다시 불러왔어.");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "처리하지 못했어.");
      }
    });
  };
  const activeAllocations = workspace.allocations.filter((allocation) => !allocation.reversed);

  return <main className="space-y-5">
    <header className={card}>
      <p className="text-sm font-bold text-blue-700">고유 ID·실제 계좌거래 기반</p>
      <h1 className="mt-1 text-3xl font-bold">{mode === "collections" ? "분담금 수납관리" : "환급관리"}</h1>
      <p className="mt-2 text-sm text-slate-600">{mode === "collections" ? "조합원 이름이 아니라 외부 원장의 고유 ID로 부과 원본을 등록하고 실제 입금을 배분해." : "원수납 배분에서 환급 결정을 만들고, 분리 승인 후 같은 금액의 실제 출금을 연결해."}</p>
      <p className="mt-2 text-xs text-slate-500">표시 이름과 조합원번호는 당시 확인용 스냅샷이며 연결 키로 사용하지 않아.</p>
    </header>

    {mode === "collections" ? <>
      <section className="grid gap-3 sm:grid-cols-3">
        <article className={card}><p className="text-sm text-slate-500">부과 원본</p><strong className="mt-1 block text-2xl">{workspace.assessments.length}건</strong></article>
        <article className={card}><p className="text-sm text-slate-500">실제 수납 배분</p><strong className="mt-1 block text-2xl">{activeAllocations.length}건</strong></article>
        <article className={card}><p className="text-sm text-slate-500">배분 가능한 입금</p><strong className="mt-1 block text-2xl">{workspace.deposit_candidates.length}건</strong></article>
      </section>
      {canDecide ? <section className={card}>
        <h2 className="text-xl font-bold">부과 원본 등록</h2>
        <p className="mt-1 text-sm text-slate-600">외부 조합원 원장에서 확인한 고유 ID를 그대로 입력해. 이름으로 기존 자료를 찾거나 합치지 않아.</p>
        <form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); command("ASSESSMENT_SAVE", Object.fromEntries(data)); }}>
          <label className="text-sm font-semibold">외부 조합원 고유 ID<input className={input} name="external_member_id" required /></label>
          <label className="text-sm font-semibold">표시 이름 스냅샷<input className={input} name="member_name_snapshot" required /></label>
          <label className="text-sm font-semibold">조합원번호 스냅샷<input className={input} name="member_no" /></label>
          <label className="text-sm font-semibold">부과 코드·회차<input className={input} name="assessment_code" placeholder="예: 2026-09-분담금-01" required /></label>
          <label className="text-sm font-semibold">납부기한<input className={input} name="due_date" type="date" /></label>
          <label className="text-sm font-semibold">부과액<input className={input} name="assessed_amount" type="number" min="1" step="1" required /></label>
          <button className={`${primary} md:col-span-3 md:justify-self-start`} disabled={pending}>부과 원본 저장</button>
        </form>
      </section> : null}
      {canDecide ? <CollectionAssessmentImport /> : null}
      <section className="space-y-3" aria-label="분담금 부과 목록">
        {workspace.assessments.map((assessment) => {
          const remaining = Number(assessment.assessed_amount) - Number(assessment.allocated_amount);
          const allocations = workspace.allocations.filter((allocation) => allocation.assessment_id === assessment.id);
          return <article className={card} key={assessment.id}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-blue-700">{assessment.external_member_id}{assessment.member_no ? ` · ${assessment.member_no}` : ""}</p><h2 className="mt-1 text-lg font-bold">{assessment.member_name_snapshot} · {assessment.assessment_code}</h2><p className="mt-1 text-sm">부과 {money(assessment.assessed_amount)} · 수납 {money(assessment.allocated_amount)} · 잔액 {money(remaining)}</p></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${remaining === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{remaining === 0 ? "완납" : "수납 진행"}</span></div>
            {canPay && remaining > 0 && workspace.deposit_candidates.length ? <form className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-3 md:grid-cols-[1fr_140px_1fr_auto]" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); command("RECEIPT_ALLOCATE", { ...Object.fromEntries(data), assessment_id: assessment.id }); }}>
              <select aria-label={`${assessment.member_name_snapshot} 입금 원본`} className={input} name="bank_transaction_id" required><option value="">실제 입금 선택</option>{workspace.deposit_candidates.map((bank) => <option key={bank.id} value={bank.id}>{bank.transacted_at.slice(0,10)} · {bank.counterparty || bank.description} · 가용 {money(bank.available_amount ?? bank.amount)}</option>)}</select>
              <input aria-label={`${assessment.member_name_snapshot} 수납 배분액`} className={input} name="amount" type="number" min="1" max={remaining} placeholder="배분액" required />
              <input aria-label={`${assessment.member_name_snapshot} 수납 확인 사유`} className={input} name="reason" placeholder="입금자·회차 확인 근거" required />
              <button className={primary} disabled={pending}>수납 배분</button>
            </form> : null}
            {allocations.length ? <div className="mt-4 divide-y border-t">{allocations.map((allocation) => <div className="py-3" key={allocation.id}><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm">{allocation.bank_date.slice(0,10)} · {allocation.bank_description} · <strong>{money(allocation.amount)}</strong>{allocation.reversed ? ` · 취소됨 (${allocation.reversal_reason})` : ""}</p>{canPay && !allocation.reversed && !workspace.refunds.some((refund) => refund.source_allocation_id === allocation.id && refund.status !== "CANCELLED") ? <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); command("RECEIPT_REVERSE", { id: allocation.id, reason: data.get("reason") }); }}><input className={input} name="reason" aria-label="수납 배분 취소 사유" placeholder="취소 사유" required /><button className={secondary} disabled={pending}>배분 취소</button></form> : null}</div>
              {canDecide && !allocation.reversed && !workspace.refunds.some((refund) => refund.source_allocation_id === allocation.id && refund.status !== "CANCELLED") ? <form className="mt-2 grid gap-2 md:grid-cols-[140px_1fr_auto]" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); command("REFUND_SAVE", { source_allocation_id: allocation.id, requested_amount: data.get("requested_amount"), reason: data.get("reason") }); }}><input className={input} name="requested_amount" aria-label="환급 결정액" type="number" min="1" max={allocation.amount} placeholder="환급 결정액" required /><input className={input} name="reason" aria-label="환급 결정 근거" placeholder="환급 결정 근거" required /><button className={secondary} disabled={pending}>환급안 작성</button></form> : null}</div>)}</div> : null}
          </article>;
        })}
        {!workspace.assessments.length ? <p className={`${card} text-center text-slate-600`}>등록된 부과 원본이 없어. 외부 원장의 고유 ID를 확인한 뒤 등록해줘.</p> : null}
      </section>
    </> : <section className="space-y-3" aria-label="환급 원장 목록">
      {workspace.refunds.map((refund) => <article className={card} key={refund.id}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-blue-700">{refund.external_member_id}</p><h2 className="mt-1 text-lg font-bold">{refund.member_name_snapshot} · {money(refund.requested_amount)}</h2><p className="mt-1 text-sm text-slate-600">{refund.reason}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{statusLabels[refund.status]}</span></div>
        <div className="mt-4 flex flex-wrap gap-2">
          {canDecide && refund.status === "DRAFT" && refund.created_by !== workspace.viewer.user_id ? <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); command("REFUND_APPROVE", { id: refund.id, lock_version: refund.lock_version, reason: data.get("reason") }); }}><input className={input} name="reason" aria-label="환급 승인 근거" placeholder="승인 근거" required /><button className={primary} disabled={pending}>분리 승인</button></form> : null}
          {canPay && refund.status === "APPROVED" ? <form className="flex flex-1 flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); command("REFUND_PAY", { id: refund.id, lock_version: refund.lock_version, bank_transaction_id: data.get("bank_transaction_id") }); }}><select className={`${input} min-w-72 flex-1`} aria-label="환급 실제 출금" name="bank_transaction_id" required><option value="">{money(refund.requested_amount)} 실제 출금 선택</option>{workspace.withdrawal_candidates.filter((bank) => Number(bank.amount) === Number(refund.requested_amount)).map((bank) => <option key={bank.id} value={bank.id}>{bank.transacted_at.slice(0,10)} · {bank.counterparty || bank.description} · {money(bank.amount)}</option>)}</select><button className={primary} disabled={pending}>실제 출금 연결</button></form> : null}
          {canDecide && (refund.status === "DRAFT" || refund.status === "APPROVED") ? <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); command("REFUND_CANCEL", { id: refund.id, lock_version: refund.lock_version, reason: data.get("reason") }); }}><input className={input} name="reason" aria-label="환급 취소 사유" placeholder="취소 사유" required /><button className={secondary} disabled={pending}>환급 취소</button></form> : null}
        </div>
      </article>)}
      {!workspace.refunds.length ? <p className={`${card} text-center text-slate-600`}>작성된 환급안이 없어. 분담금 수납관리의 원수납 배분에서 시작해줘.</p> : null}
    </section>}
    {message ? <p role="status" className="rounded-xl border bg-white p-3 text-sm">{message}</p> : null}
  </main>;
}
