"use client";

import { useState, useTransition } from "react";
import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import type { BankTransactionResolutionCandidate } from "./expense-compliance-repository";
import type { CorporateCardTransactionCandidate } from "./corporate-card-transaction";
import type { QuickExpenseRecord, QuickExpenseRecordInput, QuickExpensePaymentMethod } from "./quick-expense-record";
import type { CorporateCardTransactionImportRow } from "./corporate-card-transaction-import";
import { parseCorporateCardTransactionText } from "./corporate-card-transaction-import";
import { readBankTransactionFile } from "./bank-transaction-file";

const paymentLabels: Record<QuickExpensePaymentMethod, string> = { AUTO_DEBIT: "자동이체", BANK_TRANSFER: "계좌이체", CASH: "현금", CORPORATE_CARD: "법인카드", PERSONAL_PREPAID: "개인 선결제" };
const budgetSuggestions = [
  "복리후생비",
  "업무추진비",
  "회의비>이사회비",
  "회의비>감사비",
  "일반운영비>지급임차료",
  "일반운영비>도서인쇄비",
  "일반운영비>소모품비",
  "일반운영비>수선비",
  "제세공과금>통신비",
  "제세공과금>여비교통비",
  "제세공과금>수도광열비",
  "제세공과금>지급수수료",
  "기타운영비",
  "예비비",
];

export function QuickExpensePage({ importCardTransactions, linkCardTransaction, initialBankTransactions, initialCardTransactions, initialRecords, persistRecord }: {
  importCardTransactions?: (rows: CorporateCardTransactionImportRow[]) => Promise<unknown>;
  linkCardTransaction?: (input: { recordId: string; cardTransactionId: string }) => Promise<{ recordStatus: "RECORDED" | "NEEDS_RESOLUTION" }>;
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
  const [manualOccurredAt, setManualOccurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [manualCardEntry, setManualCardEntry] = useState(false);
  const [records, setRecords] = useState(initialRecords);
  const [linkingRecordId, setLinkingRecordId] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const isBank = paymentMethod === "BANK_TRANSFER" || paymentMethod === "AUTO_DEBIT";
  const isCard = paymentMethod === "CORPORATE_CARD";
  const availableCards = initialCardTransactions.filter((item) => !item.linkedResolutionId && !records.some((record) => record.corporateCardTransactionId === item.id));
  const isManualCard = isCard && (manualCardEntry || availableCards.length === 0);
  const bank = initialBankTransactions.find((item) => item.id === sourceId);
  const card = initialCardTransactions.find((item) => item.id === sourceId);
  const amount = bank?.withdrawalAmount ?? card?.amount ?? Number(manualAmount);
  const counterparty = bank ? bank.counterparty || bank.description : card?.merchantName ?? manualCounterparty;
  const occurredAt = bank?.transactedAt ?? card?.approvedAt ?? `${manualOccurredAt}T12:00:00+09:00`;
  const missingFields = [
    (isBank || (isCard && !isManualCard)) && !sourceId ? "실제 거래" : "",
    !(amount > 0) ? "금액" : "",
    !counterparty.trim() ? "거래처·사용처" : "",
    !usageDescription.trim() ? "사용내용" : "",
    !budgetItem.trim() ? "예산항목" : "",
  ].filter(Boolean);

  function submit() {
    if (!persistRecord) return setMessage("저장소가 연결되지 않아 사용내용을 저장할 수 없습니다.");
    if (missingFields.length) return setMessage(`먼저 ${missingFields.join(", ")}을 입력해줘.`);
    const sourceType = isBank ? "BANK_TRANSACTION" as const : isCard && !isManualCard ? "CORPORATE_CARD" as const : "MANUAL" as const;
    startTransition(async () => {
      try {
        const saved = await persistRecord({ amount, approvalSkipReason: paymentMethod === "AUTO_DEBIT" ? "정기·반복 지출" : "승인 예산 내 일상 지출", bankTransactionId: isBank ? sourceId : undefined, budgetItem, corporateCardTransactionId: isCard && !isManualCard ? sourceId : undefined, counterparty, evidenceStatus: isManualCard ? "NONE" : isCard || paymentMethod === "CASH" ? "QUALIFIED" : "GENERAL", occurredAt, paymentMethod, recordedByLabel: "오학동 사무장", sourceType, usageDescription });
        setRecords((current) => [saved, ...current]);
        setUsageDescription(""); setBudgetItem(""); setSourceId(""); setManualAmount(""); setManualCounterparty("");
        setMessage(saved.recordStatus === "RECORDED" ? "지출결의 없이 사용내용을 등록했어." : saved.recordStatus === "SOURCE_PENDING" ? "사용내용을 임시등록했어. 카드 승인내역이 들어오면 실제 거래를 연결해줘." : "정식 지출결의가 필요한 거래로 분류했어.");
      } catch (error) { setMessage(error instanceof Error ? error.message : "사용내용을 저장하지 못했습니다."); }
    });
  }

  async function uploadCardFile(file: File) {
    if (!importCardTransactions) return setMessage("카드내역 저장소가 연결되지 않았어.");
    try {
      const text = await readBankTransactionFile(file);
      const rows = parseCorporateCardTransactionText(text);
      if (!rows.length) throw new Error("등록할 카드 이용내역이 없어.");
      await importCardTransactions(rows);
      setMessage(`${rows.length}건을 등록했어. 연결 후보를 불러오기 위해 새로고침할게.`);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "카드 이용내역을 등록하지 못했어.");
    }
  }

  function candidates(record: QuickExpenseRecord) {
    return availableCards.filter((candidate) => Math.abs(candidate.amount - record.amount) <= 0.5
      && Math.abs(new Date(candidate.approvedAt).getTime() - new Date(record.occurredAt).getTime()) <= 172800000);
  }

  function connect(record: QuickExpenseRecord, cardTransactionId: string) {
    if (!linkCardTransaction) return setMessage("카드 연결 저장소가 연결되지 않았어.");
    startTransition(async () => {
      try {
        const result = await linkCardTransaction({ recordId: record.id, cardTransactionId });
        setRecords((current) => current.map((item) => item.id === record.id ? { ...item, corporateCardTransactionId: cardTransactionId, sourceType: "CORPORATE_CARD", recordStatus: result.recordStatus } : item));
        setLinkingRecordId("");
        setMessage(result.recordStatus === "RECORDED" ? "카드 이용내역을 연결하고 예산 내 간편처리를 완료했어." : "카드 이용내역은 연결했지만 승인예산이 부족하거나 없어 정식결의가 필요해.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "카드 이용내역을 연결하지 못했어.");
      }
    });
  }

  return <ErpShell activeDetailLabel="예산 내 간편지출" activeLabel="회계/자금" activeWorkspaceLabel="전표·증빙관리"><div className="mx-auto grid max-w-[1180px] gap-6">
    <section className="rounded-2xl border border-[var(--color-soft-border)] bg-white p-6"><p className="text-xs font-bold text-[var(--color-deep-cobalt)]">회계/자금 &gt; 전표·증빙관리</p><h1 className="mt-2 text-3xl font-bold">예산 내 간편지출</h1><p className="mt-2 text-sm text-[var(--color-stone)]">정식 지출결의서를 만들지 않고 실제 거래에 사용내용과 예산항목을 기록합니다. 한도초과·계약·예산 외 거래는 자동으로 정식 결의 대상으로 분류합니다.</p></section>
    <section className="grid gap-5 rounded-2xl border border-[var(--color-soft-border)] bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-[var(--color-deep-cobalt)]/35 p-4"><div><p className="font-bold">법인카드 이용내역 등록</p><p className="mt-1 text-xs text-[var(--color-stone)]">CSV·XLSX·XLS 파일의 승인일자, 금액, 가맹점, 카드번호, 승인번호를 불러옵니다.</p></div><label className="cursor-pointer rounded-full bg-[var(--color-deep-cobalt)] px-4 py-2 text-sm font-bold text-white"><input accept=".csv,.tsv,.xlsx,.xls" aria-label="법인카드 이용내역 파일" className="sr-only" onChange={(event)=>{const file=event.target.files?.[0];if(file)void uploadCardFile(file);}} type="file"/>카드내역 파일 선택</label></div>
      <fieldset><legend className="text-sm font-bold">결제수단</legend><div className="mt-3 flex flex-wrap gap-2">{(Object.keys(paymentLabels) as QuickExpensePaymentMethod[]).map((method) => <button aria-pressed={paymentMethod === method} className={`rounded-full border px-4 py-2 text-sm font-bold ${paymentMethod === method ? "border-[var(--color-deep-cobalt)] bg-[var(--color-morning-tint)]" : "border-[var(--color-soft-border)]"}`} key={method} onClick={() => { setPaymentMethod(method); setSourceId(""); setManualCardEntry(false); setMessage(""); }} type="button">{paymentLabels[method]}</button>)}</div></fieldset>
      {isBank ? <label className="grid gap-2 text-sm font-bold"><span>미처리 통장 출금거래</span><select className="h-11 rounded-lg border px-3" onChange={(event) => setSourceId(event.target.value)} value={sourceId}><option value="">거래 선택</option>{initialBankTransactions.filter((item) => !item.linkedResolutionId && !records.some((record) => record.bankTransactionId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.transactedAt.slice(0,10)} · {item.withdrawalAmount.toLocaleString("ko-KR")}원 · {item.counterparty || item.description}</option>)}</select></label> : null}
      {isCard && availableCards.length ? <div className="grid gap-3"><label className="grid gap-2 text-sm font-bold"><span>미처리 법인카드 승인내역</span><select className="h-11 rounded-lg border px-3" onChange={(event) => { setSourceId(event.target.value); setManualCardEntry(false); }} value={sourceId}><option value="">거래 선택</option>{availableCards.map((item) => <option key={item.id} value={item.id}>{item.approvedAt.slice(0,10)} · {item.amount.toLocaleString("ko-KR")}원 · {item.merchantName}</option>)}</select></label><button className="justify-self-start text-sm font-bold text-[var(--color-deep-cobalt)] underline underline-offset-4" onClick={() => { setManualCardEntry(true); setSourceId(""); }} type="button">승인내역 없이 임시등록</button></div> : null}
      {isCard && !availableCards.length ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4"><p className="font-bold text-amber-900">등록된 미처리 법인카드 승인내역이 없습니다.</p><p className="mt-1 text-sm text-amber-800">결제 내용을 먼저 임시등록할 수 있어. 카드내역이 동기화되면 실제 승인거래를 연결해줘.</p></div> : null}
      {isManualCard ? <div className="grid gap-4 md:grid-cols-3"><label className="grid gap-2 text-sm font-bold"><span>카드 사용일</span><input className="h-11 rounded-lg border px-3" onChange={(event) => setManualOccurredAt(event.target.value)} type="date" value={manualOccurredAt} /></label><label className="grid gap-2 text-sm font-bold"><span>카드 사용금액</span><input className="h-11 rounded-lg border px-3" inputMode="numeric" onChange={(event) => setManualAmount(event.target.value.replace(/\D/g, ""))} value={manualAmount} /></label><label className="grid gap-2 text-sm font-bold"><span>가맹점·사용처</span><input className="h-11 rounded-lg border px-3" onChange={(event) => setManualCounterparty(event.target.value)} value={manualCounterparty} /></label></div> : null}
      {!isBank && !isCard ? <div className="grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm font-bold"><span>금액</span><input className="h-11 rounded-lg border px-3" inputMode="numeric" onChange={(event) => setManualAmount(event.target.value.replace(/\D/g, ""))} value={manualAmount} /></label><label className="grid gap-2 text-sm font-bold"><span>거래처·지급대상</span><input className="h-11 rounded-lg border px-3" onChange={(event) => setManualCounterparty(event.target.value)} value={manualCounterparty} /></label></div> : null}
      <label className="grid gap-2 text-sm font-bold"><span>사용내용</span><textarea className="min-h-24 rounded-lg border p-3" onChange={(event) => setUsageDescription(event.target.value)} placeholder="예: 조합 사무실 인터넷 요금" value={usageDescription} /></label>
      <label className="grid gap-2 text-sm font-bold"><span>예산항목</span><input className="h-11 rounded-lg border px-3" list="quick-expense-budget-items" onChange={(event) => setBudgetItem(event.target.value)} placeholder="예산항목 선택 또는 입력" value={budgetItem} /><datalist id="quick-expense-budget-items">{budgetSuggestions.map((item) => <option key={item} value={item} />)}</datalist></label>
      <div className="grid gap-3 rounded-xl border border-[var(--color-deep-cobalt)]/20 bg-[var(--color-morning-tint)]/35 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="text-sm font-bold">{amount > 0 ? `${counterparty || "거래처 미입력"} · ${amount.toLocaleString("ko-KR")}원` : "거래와 사용내용을 입력해줘."}</p><p className={`mt-1 text-xs font-semibold ${missingFields.length ? "text-[var(--color-tangerine)]" : "text-[var(--color-green-ink)]"}`}>{missingFields.length ? `입력 필요: ${missingFields.join(", ")}` : isManualCard ? "등록 후 카드내역 연결대기로 보관됩니다." : "등록할 수 있습니다."}</p></div><Button className="min-w-36 bg-[var(--color-pressed-charcoal)] text-white" disabled={isPending} onClick={submit}>{isPending ? "저장 중" : isManualCard ? "사용내용 임시등록" : "사용내용 등록"}</Button></div>
      {message ? <p aria-live="polite" className="rounded-lg bg-[var(--color-morning-tint)] px-4 py-3 text-sm font-bold text-[var(--color-deep-cobalt)]">{message}</p> : null}
    </section>
    <section className="rounded-2xl border border-[var(--color-soft-border)] bg-white p-6"><h2 className="text-lg font-bold">최근 간편지출 기록</h2><div className="mt-4 grid gap-3">{records.length ? records.map((record) => <article className="rounded-xl border p-4" key={record.id}><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold">{record.usageDescription}</p>{record.recordStatus==="SOURCE_PENDING"?<button className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900" onClick={()=>setLinkingRecordId(record.id)} type="button">카드내역 연결대기</button>:<span className={`rounded-full px-3 py-1 text-xs font-bold ${record.recordStatus === "RECORDED" ? "bg-[var(--color-sprout)] text-[var(--color-green-ink)]" : "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]"}`}>{record.recordStatus === "RECORDED" ? "간편처리 완료" : "정식결의 필요"}</span>}</div><p className="mt-2 text-sm text-[var(--color-stone)]">{record.counterparty} · {record.amount.toLocaleString("ko-KR")}원 · {record.budgetItem}</p>{linkingRecordId===record.id?<div className="mt-3 grid gap-2 rounded-lg bg-[var(--color-cloud-veil)] p-3"><p className="text-sm font-bold">금액·사용일이 일치하는 카드내역</p>{candidates(record).length?candidates(record).map(card=><button className="rounded-lg border bg-white px-3 py-2 text-left text-sm" key={card.id} onClick={()=>connect(record,card.id)} type="button">{card.approvedAt.slice(0,10)} · {card.merchantName} · {card.amount.toLocaleString("ko-KR")}원 · 연결</button>):<p className="text-sm text-[var(--color-stone)]">일치 후보가 없어. 카드내역 파일을 먼저 등록해줘.</p>}</div>:null}</article>) : <p className="text-sm text-[var(--color-stone)]">등록된 간편지출이 없습니다.</p>}</div></section>
  </div></ErpShell>;
}
