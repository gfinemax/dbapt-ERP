"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { expenseResolutionHref } from "./expense-entry";

export type ExpenseEntryFlow = "" | "organization" | "personal" | "before" | "advance";
export type ExpenseEntryMethod = "corporate-card" | "bank-transfer" | "auto-debit" | "cash";

type EntrySituation = "PAID" | "BEFORE" | "ADVANCE";
type PaidBy = "ORGANIZATION" | "PERSONAL" | "";

const card = "rounded-2xl border border-slate-200 bg-white p-5";
const action = "inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white";
const secondary = "inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800";
const selected = "rounded-xl border-2 border-blue-500 bg-blue-50 px-4 py-3 text-left shadow-sm";
const option = "rounded-xl border border-slate-300 bg-white px-4 py-3 text-left hover:border-blue-300 hover:bg-blue-50/40";

const paymentMethods: { id: ExpenseEntryMethod; label: string }[] = [
  { id: "corporate-card", label: "법인카드" },
  { id: "bank-transfer", label: "조합 계좌이체" },
  { id: "auto-debit", label: "자동이체" },
  { id: "cash", label: "조합 현금" },
];

export function ExpenseEntryPage({ activeFlow, activeMethod, children, staff }: {
  activeFlow: ExpenseEntryFlow;
  activeMethod?: ExpenseEntryMethod;
  children?: ReactNode;
  staff: boolean;
}) {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const initialSituation: EntrySituation = activeFlow === "before" ? "BEFORE" : activeFlow === "advance" ? "ADVANCE" : "PAID";
  const initialPaidBy: PaidBy = activeFlow === "organization" ? "ORGANIZATION" : activeFlow === "personal" || !staff ? "PERSONAL" : "";
  const [situation, setSituation] = useState<EntrySituation>(initialSituation);
  const [paidBy, setPaidBy] = useState<PaidBy>(initialPaidBy);

  function navigate(href: string) {
    startNavigation(() => router.replace(href, { scroll: false }));
  }

  function chooseSituation(next: EntrySituation) {
    setSituation(next);
    if (next === "PAID") {
      setPaidBy(staff ? "" : "PERSONAL");
      navigate(staff ? "/finance/expense-entry" : "/finance/expense-entry?flow=personal");
      return;
    }
    setPaidBy("");
    navigate(`/finance/expense-entry?flow=${next === "BEFORE" ? "before" : "advance"}`);
  }

  function choosePaidBy(next: Exclude<PaidBy, "">) {
    setPaidBy(next);
    navigate(next === "PERSONAL" ? "/finance/expense-entry?flow=personal" : "/finance/expense-entry?flow=organization");
  }

  function chooseMethod(method: ExpenseEntryMethod) {
    navigate(`/finance/expense-entry?flow=organization&method=${method}`);
  }

  return (
    <div className="space-y-5">
      <header className={card}>
        <h1 className="text-3xl font-bold">지출 등록·신청</h1>
        <p className="mt-2 text-slate-600">현재 상황과 돈의 출처를 선택하면 이 화면에서 바로 입력할 수 있어.</p>
      </header>

      <section aria-labelledby="entry-situation-title" className={card}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-700">1단계</p>
            <h2 className="mt-1 text-xl font-bold" id="entry-situation-title">지금 어떤 상황인가요?</h2>
          </div>
          <p className="max-w-xl text-sm text-slate-600">대부분은 이미 결제한 사용내역을 등록해. 아직 결제하지 않은 지급 요청은 필요한 경우에만 선택하면 돼.</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3" role="group" aria-label="지출 시점">
          <button aria-pressed={situation === "PAID"} className={situation === "PAID" ? selected : option} onClick={() => chooseSituation("PAID")} type="button">
            <span className="block font-bold">이미 결제했어요</span>
            <span className="mt-1 block text-sm text-slate-600">영수증·카드·계좌 거래를 등록해.</span>
          </button>
          {staff ? <button aria-pressed={situation === "BEFORE"} className={situation === "BEFORE" ? selected : option} onClick={() => chooseSituation("BEFORE")} type="button">
            <span className="block font-bold">아직 결제 전 · 지급 요청</span>
            <span className="mt-1 block text-sm text-slate-600">먼저 승인을 받거나 업체 지급을 요청해.</span>
          </button> : null}
          {staff ? <button aria-pressed={situation === "ADVANCE"} className={situation === "ADVANCE" ? selected : option} onClick={() => chooseSituation("ADVANCE")} type="button">
            <span className="block font-bold">선지급금을 사용했어요</span>
            <span className="mt-1 block text-sm text-slate-600">받은 금액의 사용·반납·추가 지급을 정산해.</span>
          </button> : null}
        </div>
      </section>

      {situation === "PAID" ? <PaidExpenseRoute activeMethod={activeMethod} chooseMethod={chooseMethod} choosePaidBy={choosePaidBy} paidBy={paidBy} staff={staff} /> : null}
      {situation === "BEFORE" && staff ? <BeforePaymentRoute /> : null}
      {situation === "ADVANCE" && staff ? <AdvanceSettlementRoute /> : null}

      {isNavigating ? <p aria-live="polite" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-900">선택한 입력 화면을 불러오고 있어…</p> : null}

      {children ? <section aria-label="선택한 지출 입력 화면" className="space-y-4 rounded-2xl border-2 border-blue-200 bg-blue-50/30 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm font-semibold text-blue-700">선택한 처리 경로</p><h2 className="mt-1 text-xl font-bold">{activePathLabel(activeFlow, activeMethod)}</h2></div>
          <button className={secondary} onClick={() => chooseSituation("PAID")} type="button">선택 다시하기</button>
        </div>
        {children}
      </section> : null}

      {!staff ? <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-slate-700">현재 계정은 본인이 먼저 결제한 개인 지출 정산만 신청할 수 있어. 조합 자금의 사전 승인·지급·선지급 업무는 담당 권한이 있는 계정에만 보여.</p> : null}
    </div>
  );
}

function PaidExpenseRoute({ activeMethod, chooseMethod, choosePaidBy, paidBy, staff }: {
  activeMethod?: ExpenseEntryMethod;
  chooseMethod: (method: ExpenseEntryMethod) => void;
  choosePaidBy: (value: Exclude<PaidBy, "">) => void;
  paidBy: PaidBy;
  staff: boolean;
}) {
  return <section aria-labelledby="paid-source-title" className={card}>
    <p className="text-sm font-semibold text-blue-700">2단계</p>
    <h2 className="mt-1 text-xl font-bold" id="paid-source-title">누구의 돈으로 결제했나요?</h2>
    {staff ? <div className="mt-4 grid gap-3 sm:grid-cols-2" role="group" aria-label="돈의 출처">
      <button aria-pressed={paidBy === "ORGANIZATION"} className={paidBy === "ORGANIZATION" ? selected : option} onClick={() => choosePaidBy("ORGANIZATION")} type="button">
        <span className="block font-bold">조합 돈</span><span className="mt-1 block text-sm text-slate-600">법인카드·조합계좌·자동이체·조합 현금</span>
      </button>
      <button aria-pressed={paidBy === "PERSONAL"} className={paidBy === "PERSONAL" ? selected : option} onClick={() => choosePaidBy("PERSONAL")} type="button">
        <span className="block font-bold">개인 돈</span><span className="mt-1 block text-sm text-slate-600">개인카드·개인계좌·개인 현금</span>
      </button>
    </div> : null}

    {!paidBy ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">돈의 출처를 선택하면 결제수단과 맞는 입력 화면을 아래에 바로 보여줄게.</p> : null}

    {paidBy === "ORGANIZATION" ? <div className="mt-5 border-t border-slate-200 pt-5">
      <h3 className="font-bold">어떻게 결제했나요?</h3>
      <p className="mt-1 text-sm text-slate-600">결제수단을 고르면 저장·OCR·예산 연결이 가능한 실제 입력 폼이 같은 화면 아래에 열려.</p>
      <div className="mt-4 flex flex-wrap gap-3" role="group" aria-label="조합 결제수단">
        {paymentMethods.map((method) => <button aria-pressed={activeMethod === method.id} className={activeMethod === method.id ? action : secondary} key={method.id} onClick={() => chooseMethod(method.id)} type="button">{method.label}</button>)}
      </div>
    </div> : null}

    {paidBy === "PERSONAL" ? <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
      <h3 className="font-bold">개인 선지출 정산</h3>
      <p className="mt-1 text-sm text-slate-600">개인카드·개인계좌·개인 현금으로 먼저 낸 비용은 간편지출에 중복 등록하지 않고, 아래 정산 신청 폼에서 바로 작성해.</p>
    </div> : null}
  </section>;
}

function BeforePaymentRoute() {
  return <section aria-labelledby="before-payment-title" className={card}>
    <p className="text-sm font-semibold text-amber-700">결제 전 · 예외 경로</p>
    <h2 className="mt-1 text-xl font-bold" id="before-payment-title">먼저 승인받거나 지급을 요청해</h2>
    <p className="mt-2 text-sm text-slate-600">실제 결제가 아직 없으므로 간편지출 원본을 만들지 않아. 승인된 결의에 실제 카드·계좌 거래와 증빙을 연결해 하나의 지출로 이어가.</p>
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <article className="rounded-xl border border-slate-200 p-4"><h3 className="font-bold">일반 지급·구매 사전승인</h3><p className="mt-1 text-sm text-slate-600">업체 지급, 계약, 고액·예산 외 지출 또는 사전 승인이 필요한 구매를 결의해.</p><Link className={`${action} mt-4`} href={expenseResolutionHref({ start: "advance" })}>사전 지출결의 작성</Link></article>
      <article className="rounded-xl border border-slate-200 p-4"><h3 className="font-bold">사업비 신탁 집행요청</h3><p className="mt-1 text-sm text-slate-600">신탁사 요청이 필요한 사업비는 정식 결의 근거를 준비한 뒤 집행요청과 연결해.</p><Link className={`${secondary} mt-4`} href="/finance/trust?view=business">사업비 집행요청 열기</Link></article>
    </div>
    <p className="mt-4 rounded-xl bg-blue-50 p-4 text-sm text-slate-700">예산 내 일상적인 법인카드 구매는 별도 사전 결의를 만들지 않아도 돼. 실제 결제 후 카드내역으로 등록하면 돼.</p>
  </section>;
}

function AdvanceSettlementRoute() {
  return <section aria-labelledby="advance-settlement-title" className={card}>
    <p className="text-sm font-semibold text-emerald-700">선지급금 정산</p>
    <h2 className="mt-1 text-xl font-bold" id="advance-settlement-title">받은 돈의 사용과 잔액을 정산해</h2>
    <p className="mt-2 text-sm text-slate-600">최초 선지급액과 실제 사용내역을 연결하고, 남은 금액의 반납 또는 부족액의 추가 지급을 구분해.</p>
    <Link className={`${action} mt-4`} href="/finance/advance-settlements">선지급 사용정산 열기</Link>
  </section>;
}

function activePathLabel(flow: ExpenseEntryFlow, method?: ExpenseEntryMethod) {
  if (flow === "personal") return "결제 완료 → 개인 돈 → 개인 선지출 정산";
  const methodLabel = paymentMethods.find((item) => item.id === method)?.label;
  return `결제 완료 → 조합 돈${methodLabel ? ` → ${methodLabel}` : ""}`;
}
