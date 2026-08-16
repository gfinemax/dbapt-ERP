"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ErpShell } from "@/components/erp-shell";
import { createApprovalAction } from "@/app/approval/actions";
import type { ApprovalBudgetOption } from "./approval-settings-repository";
import type { ApprovalDocumentType } from "./approval-domain";
import { organizationApprovalLine } from "./organization-approval-line";
import { suggestApprovalDraft } from "./approval-draft-assistant";

const inputClass =
  "mt-1 w-full rounded-xl border border-[var(--color-soft-border)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--color-deep-cobalt)]";
const LOCAL_DRAFT_KEY = "dbapt-erp:approval-new-draft:v1";

export function ApprovalNewPage({
  accountSubjects = [],
  budgets = [],
  partners = [],
}: {
  accountSubjects?: string[];
  budgets?: ApprovalBudgetOption[];
  partners?: string[];
}) {
  const today = currentSeoulDate();
  const currentYear = Number(today.slice(0, 4));
  const [documentType, setDocumentType] =
    useState<ApprovalDocumentType>("GENERAL");
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [body, setBody] = useState("");
  const [purposeEdited, setPurposeEdited] = useState(false);
  const [bodyEdited, setBodyEdited] = useState(false);
  const [amount, setAmount] = useState(0);
  const [budgetEnabled, setBudgetEnabled] = useState(false);
  const [budgetId, setBudgetId] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [accountSubject, setAccountSubject] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [splitLines, setSplitLines] = useState(false);
  const [contractRelated, setContractRelated] = useState(false);
  const [installmentPayment, setInstallmentPayment] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [assistantMessage, setAssistantMessage] = useState("");
  const selectedBudget = budgets.find((item) => item.id === budgetId);
  const suggestion = useMemo(
    () => suggestApprovalDraft({ accountSubjects, body, budgets, counterpartyName, documentType }),
    [accountSubjects, body, budgets, counterpartyName, documentType],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!title && !body && !counterpartyName && !amount) return;
      window.localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify({ amount, body, budgetEnabled, budgetId, counterpartyName, documentType, title }));
      setSavedAt(new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(new Date()));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [amount, body, budgetEnabled, budgetId, counterpartyName, documentType, title]);

  function changeTitle(value: string) {
    setTitle(value);
    if (!purposeEdited) setPurpose(value);
    if (!bodyEdited) setBody(value);
  }

  function changeDocumentType(value: ApprovalDocumentType) {
    setDocumentType(value);
    setBudgetEnabled(value !== "GENERAL" && budgets.length > 0);
    setContractRelated(value === "CONTRACT");
  }

  function applySuggestion() {
    if (suggestion.title) setTitle(suggestion.title);
    if (suggestion.accountSubject) setAccountSubject(suggestion.accountSubject);
    if (suggestion.budgetId) {
      setBudgetEnabled(true);
      setBudgetId(suggestion.budgetId);
    }
    if (!purposeEdited && suggestion.title) setPurpose(suggestion.title);
    setAssistantMessage("추천 내용을 적용했어요. 상신 전에 한 번 확인해주세요.");
  }

  function restoreLocalDraft() {
    const raw = window.localStorage.getItem(LOCAL_DRAFT_KEY);
    if (!raw) {
      setAssistantMessage("불러올 임시저장 기안이 없어요.");
      return;
    }
    try {
      const draft = JSON.parse(raw) as Partial<{ amount: number; body: string; budgetEnabled: boolean; budgetId: string; counterpartyName: string; documentType: ApprovalDocumentType; title: string }>;
      setAmount(draft.amount ?? 0);
      setBody(draft.body ?? "");
      setBudgetEnabled(Boolean(draft.budgetEnabled));
      setBudgetId(draft.budgetId ?? "");
      setCounterpartyName(draft.counterpartyName ?? "");
      setDocumentType(draft.documentType ?? "GENERAL");
      setTitle(draft.title ?? "");
      setBodyEdited(Boolean(draft.body));
      setAssistantMessage("마지막 임시저장 기안을 불러왔어요.");
    } catch {
      setAssistantMessage("임시저장 기안을 불러오지 못했어요.");
    }
  }

  return (
    <ErpShell activeDetailLabel="새 기안" activeLabel="기안·결재">
      <main className="mx-auto max-w-[1480px] space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-soft-border)] bg-white px-5 py-4">
          <div>
            <p className="text-sm font-bold text-[var(--color-deep-cobalt)]">핵심 내용만 입력하면 나머지는 자동으로 채워져</p>
            <h1 className="mt-1 text-2xl font-bold">간편 기안 작성</h1>
          </div>
          <div className="flex items-center gap-3">
            {savedAt ? <p className="text-xs font-semibold text-[var(--color-stone)]" role="status">{savedAt} 자동 저장</p> : null}
            <button className="rounded-full border border-[var(--color-soft-border)] px-4 py-2 text-sm font-bold" onClick={restoreLocalDraft} type="button">이전 기안 불러오기</button>
          </div>
        </header>

        <form action={createApprovalAction} className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
          <Section title="기본 내용">
            <label className="text-sm font-semibold">
              기안 유형
              <select
                className={inputClass}
                name="documentType"
                onChange={(event) =>
                  changeDocumentType(event.target.value as ApprovalDocumentType)
                }
                value={documentType}
              >
                <option value="GENERAL">일반기안</option>
                <option value="EXPENSE">지출품의</option>
                <option value="CONTRACT">계약기안</option>
              </select>
            </label>
            <label className="text-sm font-semibold">
              제목
              <input
                className={inputClass}
                name="title"
                onChange={(event) => changeTitle(event.target.value)}
                required
                value={title}
              />
            </label>
            <label className="text-sm font-semibold md:col-span-2">
              기안 내용
              <textarea
                className={`${inputClass} min-h-24`}
                name="body"
                onChange={(event) => {
                  setBodyEdited(true);
                  setBody(event.target.value);
                }}
                placeholder="제목과 다른 설명이 필요할 때만 수정해"
                value={body}
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--color-cloud-veil)] px-4 py-3 md:col-span-2">
              <div>
                <p className="text-sm font-bold">내용을 바탕으로 제목과 회계 항목을 추천할 수 있어요</p>
                <p className="mt-0.5 text-xs text-[var(--color-stone)]">추천값은 자동 확정되지 않으며 언제든 수정할 수 있습니다.</p>
              </div>
              <button className="rounded-full bg-[var(--color-deep-cobalt)] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={!body.trim()} onClick={applySuggestion} type="button">자동 추천</button>
            </div>
            <label className="text-sm font-semibold">
              총금액
              <input
                className={inputClass}
                min="0"
                name="amount"
                onChange={(event) => setAmount(Number(event.target.value) || 0)}
                placeholder={documentType === "GENERAL" ? "금액이 없으면 0" : "금액 입력"}
                type="number"
                value={amount || ""}
              />
            </label>
            <label className="text-sm font-semibold">
              대표 거래처
              <input
                className={inputClass}
                list="approval-partners"
                name="counterpartyName"
                onChange={(event) => setCounterpartyName(event.target.value)}
                value={counterpartyName}
              />
            </label>
            <label className="text-sm font-semibold">
              첨부파일
              <input accept="image/*,.pdf" className={inputClass} name="attachment" type="file" />
            </label>
            <label className="flex items-center gap-2 self-end rounded-xl bg-[var(--color-cloud-veil)] px-4 py-3 text-sm font-semibold">
              <input
                checked={budgetEnabled}
                name="budgetEnabled"
                onChange={(event) => setBudgetEnabled(event.target.checked)}
                type="checkbox"
              />
              예산을 사용하는 기안
            </label>
          </Section>

          {budgetEnabled ? (
            <Section title="예산·회계 요약">
              <label className="text-sm font-semibold">
                예산 항·목·세목
                <select
                  className={inputClass}
                  name="budgetItem"
                  onChange={(event) =>
                    setBudgetId(event.target.selectedOptions[0]?.dataset.id ?? "")
                  }
                  value={selectedBudget?.budgetItem ?? ""}
                >
                  <option value="">예산 선택</option>
                  {budgets.map((budget) => (
                    <option data-id={budget.id} key={budget.id} value={budget.budgetItem}>
                      {budget.fiscalYear} · {budget.budgetItem}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold">
                계정과목
                <input
                  className={inputClass}
                  list="approval-account-subjects"
                  onChange={(event) => setAccountSubject(event.target.value)}
                  value={accountSubject}
                />
              </label>
              {selectedBudget ? (
                <div className="grid gap-2 rounded-xl bg-[var(--color-cloud-veil)] p-4 text-sm md:col-span-2 sm:grid-cols-3">
                  <Summary label="사용 가능액" value={selectedBudget.availableAmount} />
                  <Summary label="이번 기안금액" value={amount} />
                  <Summary label="승인 후 예상잔액" value={selectedBudget.availableAmount - amount} />
                </div>
              ) : null}
              <button
                className="justify-self-start rounded-full border border-[var(--color-soft-border)] px-4 py-2 text-sm font-bold md:col-span-2"
                onClick={() => setSplitLines((value) => !value)}
                type="button"
              >
                {splitLines ? "세부내역 접기" : "세부내역 나누기"}
              </button>
              {splitLines ? (
                <AccountingLines />
              ) : (
                <>
                  <input name="linePartner1" type="hidden" value={counterpartyName} />
                  <input name="accountSubject1" type="hidden" value={accountSubject} />
                  <input name="lineBudgetItem1" type="hidden" value={selectedBudget?.budgetItem ?? ""} />
                  <input name="supplyAmount1" type="hidden" value={amount} />
                  <input name="vatAmount1" type="hidden" value="0" />
                  <input name="lineDescription1" type="hidden" value={body || title} />
                </>
              )}
            </Section>
          ) : (
            <input name="outOfBudget" type="hidden" value="on" />
          )}

          {(documentType === "CONTRACT" || contractRelated) ? (
            <Section title="계약 정보">
              <Field defaultValue={today} label="계약 시작일" name="contractStartDate" type="date" />
              <Field label="계약 종료일" name="contractEndDate" type="date" />
              <Field label="계약 지급조건" name="contractPaymentTerms" />
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  checked={installmentPayment}
                  name="installmentPayment"
                  onChange={(event) => setInstallmentPayment(event.target.checked)}
                  type="checkbox"
                />
                분할 지급
              </label>
              {installmentPayment ? <PaymentSchedule /> : null}
            </Section>
          ) : null}

          <section className="rounded-2xl border border-[var(--color-soft-border)] bg-white p-5">
            <button
              aria-expanded={advancedOpen}
              className="font-bold"
              onClick={() => setAdvancedOpen((value) => !value)}
              type="button"
            >
              {advancedOpen ? "고급 설정 접기" : "고급 설정 열기"}
            </button>
            {advancedOpen ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field defaultValue="오학동" label="기안자" name="drafterLabel" required />
                <Field defaultValue="사무국" label="부서" name="departmentLabel" required />
                <Field defaultValue={today} label="시행 희망일" name="desiredExecutionDate" type="date" />
                <Field label="프로젝트" name="projectName" />
                <label className="text-sm font-semibold">
                  공개·보안
                  <select className={inputClass} defaultValue="INTERNAL" name="securityLevel">
                    <option value="INTERNAL">내부</option>
                    <option value="PUBLIC">공개</option>
                    <option value="CONFIDENTIAL">보안</option>
                  </select>
                </label>
                <Field label="관련 문서" name="relatedDocument" placeholder="없음" />
                <label className="text-sm font-semibold md:col-span-2">
                  목적 및 필요성
                  <input
                    className={inputClass}
                    name="purpose"
                    onChange={(event) => {
                      setPurposeEdited(true);
                      setPurpose(event.target.value);
                    }}
                    value={purpose}
                  />
                </label>
                <label className="text-sm font-semibold md:col-span-2">
                  기대효과
                  <textarea className={`${inputClass} min-h-20`} name="expectedEffect" />
                </label>
                <Field defaultValue={String(selectedBudget?.fiscalYear ?? currentYear)} label="회계연도" name="fiscalYear" type="number" />
                <Field defaultValue={today} label="지급 예정일" name="paymentDueDate" type="date" />
                <label className="text-sm font-semibold">
                  지급 방법
                  <select className={inputClass} defaultValue="계좌이체" name="paymentMethod">
                    <option value="계좌이체">계좌이체</option>
                    <option value="법인카드">법인카드</option>
                    <option value="현금">현금</option>
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  증빙 종류
                  <select className={inputClass} name="evidenceKind">
                    <option value="">선택</option>
                    <option value="TAX_INVOICE">세금계산서</option>
                    <option value="CARD_RECEIPT">카드전표</option>
                    <option value="CASH_RECEIPT">현금영수증</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold"><input name="urgent" type="checkbox" />긴급 문서</label>
                <label className="flex items-center gap-2 text-sm font-semibold"><input checked={contractRelated} name="contractRelated" onChange={(event) => setContractRelated(event.target.checked)} type="checkbox" />계약 관련</label>
                <label className="flex items-center gap-2 text-sm font-semibold"><input name="memberBurden" type="checkbox" />조합원 추가부담</label>
                <input name="finalMeetingBody" type="hidden" value="" />
              </div>
            ) : (
              <>
                <input name="drafterLabel" type="hidden" value="오학동" />
                <input name="departmentLabel" type="hidden" value="사무국" />
                <input name="desiredExecutionDate" type="hidden" value={today} />
                <input name="securityLevel" type="hidden" value="INTERNAL" />
                <input name="purpose" type="hidden" value={purpose || title} />
                <input name="fiscalYear" type="hidden" value={selectedBudget?.fiscalYear ?? currentYear} />
                <input name="paymentDueDate" type="hidden" value={today} />
                <input name="paymentMethod" type="hidden" value="계좌이체" />
              </>
            )}
          </section>
          </div>

          <datalist id="approval-partners">{partners.map((name) => <option key={name} value={name} />)}</datalist>
          <datalist id="approval-account-subjects">{accountSubjects.map((name) => <option key={name} value={name} />)}</datalist>
          <ApprovalReviewPanel
            accountSubject={accountSubject}
            amount={amount}
            assistantMessage={assistantMessage}
            body={body}
            budgetEnabled={budgetEnabled}
            counterpartyName={counterpartyName}
            selectedBudget={selectedBudget}
            suggestion={suggestion}
            title={title}
          />
        </form>
      </main>
    </ErpShell>
  );
}

function AccountingLines() {
  return (
    <div className="overflow-x-auto md:col-span-2">
      <table className="w-full min-w-[860px] text-sm">
        <thead><tr>{["거래처", "계정과목", "예산항목", "공급가액", "부가세", "설명"].map((label) => <th className="px-2 py-2 text-left" key={label}>{label}</th>)}</tr></thead>
        <tbody>{[1, 2, 3].map((index) => <tr key={index}>
          <td><input className={inputClass} list="approval-partners" name={`linePartner${index}`} /></td>
          <td><input className={inputClass} list="approval-account-subjects" name={`accountSubject${index}`} /></td>
          <td><input className={inputClass} name={`lineBudgetItem${index}`} /></td>
          <td><input className={inputClass} min="0" name={`supplyAmount${index}`} type="number" /></td>
          <td><input className={inputClass} min="0" name={`vatAmount${index}`} type="number" /></td>
          <td><input className={inputClass} name={`lineDescription${index}`} /></td>
        </tr>)}</tbody>
      </table>
      <p className="mt-2 text-xs text-[var(--color-stone)]">공급가액과 부가세 합계는 총금액과 같아야 해.</p>
    </div>
  );
}

function PaymentSchedule() {
  return <div className="grid gap-3 md:col-span-2 md:grid-cols-3">{[1, 2, 3].map((index) => <div className="contents" key={index}>
    <Field label={`${index}차 지급일`} name={`scheduleDate${index}`} type="date" />
    <Field label="금액" min="0" name={`scheduleAmount${index}`} type="number" />
    <Field label="비고" name={`scheduleMemo${index}`} />
  </div>)}</div>;
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return <section className="grid gap-4 rounded-2xl border border-[var(--color-soft-border)] bg-white p-5 md:grid-cols-2"><h2 className="text-lg font-bold md:col-span-2">{title}</h2>{children}</section>;
}

function ApprovalReviewPanel({
  accountSubject,
  amount,
  assistantMessage,
  body,
  budgetEnabled,
  counterpartyName,
  selectedBudget,
  suggestion,
  title,
}: {
  accountSubject: string;
  amount: number;
  assistantMessage: string;
  body: string;
  budgetEnabled: boolean;
  counterpartyName: string;
  selectedBudget?: ApprovalBudgetOption;
  suggestion: ReturnType<typeof suggestApprovalDraft>;
  title: string;
}) {
  const checks = [
    { complete: Boolean(title.trim()), label: "제목" },
    { complete: Boolean(body.trim()), label: "기안 내용" },
    { complete: amount > 0 || !budgetEnabled, label: "기안 금액" },
    { complete: !budgetEnabled || Boolean(selectedBudget), label: "예산 항목" },
    { complete: !budgetEnabled || Boolean(accountSubject), label: "계정과목" },
  ];
  const completeCount = checks.filter((item) => item.complete).length;
  const balance = selectedBudget ? selectedBudget.availableAmount - amount : 0;

  return (
    <aside className="space-y-4 xl:sticky xl:top-4">
      <section className="rounded-2xl border border-[var(--color-soft-border)] bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">상신 전 검토</h2>
          <span className="rounded-full bg-[var(--color-cloud-veil)] px-3 py-1 text-xs font-bold">{completeCount}/{checks.length}</span>
        </div>
        <div className="mt-4 grid gap-2">
          {checks.map((item) => (
            <p className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold ${item.complete ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`} key={item.label}>
              <span>{item.label}</span><span>{item.complete ? "완료" : "확인 필요"}</span>
            </p>
          ))}
        </div>
      </section>

      {body.trim() ? (
        <section className="rounded-2xl border border-[var(--color-soft-border)] bg-white p-5">
          <p className="text-xs font-bold text-[var(--color-deep-cobalt)]">스마트 추천 · 신뢰도 {suggestion.confidence}</p>
          <h2 className="mt-1 text-base font-bold">{suggestion.title}</h2>
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-[var(--color-stone)]">계정과목</dt><dd className="font-bold">{suggestion.accountSubject || "등록 항목에서 선택 필요"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--color-stone)]">예산</dt><dd className="text-right font-bold">{suggestion.budgetItem || "추천 가능한 예산 없음"}</dd></div>
          </dl>
          <p className="mt-3 text-xs leading-5 text-[var(--color-stone)]">{suggestion.reason}</p>
          {assistantMessage ? <p className="mt-3 rounded-lg bg-[var(--color-cloud-veil)] p-3 text-xs font-bold" role="status">{assistantMessage}</p> : null}
        </section>
      ) : null}

      <section className="rounded-2xl border border-[var(--color-soft-border)] bg-white p-5">
        <h2 className="text-lg font-bold">자동 설정</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <AutoValue label="기안자" value="오학동" />
          <AutoValue label="부서" value="사무국" />
          <AutoValue label="공개·보안" value="내부" />
          <AutoValue label="예산" value={budgetEnabled ? "예산 사용" : "예산 없음"} />
          <AutoValue label="의결" value="자동 검토 중" />
        </div>
        <div className="mt-3 rounded-xl bg-[var(--color-cloud-veil)] p-3">
          <p className="text-xs font-bold text-[var(--color-stone)]">공통 결재선</p>
          <p className="mt-1 text-sm font-semibold">{organizationApprovalLine.map((step) => `${step.approverRole} ${step.approverLabel}`).join(" → ")}</p>
        </div>
      </section>

      {budgetEnabled ? (
        <section className="rounded-2xl border border-[var(--color-soft-border)] bg-white p-5">
          <h2 className="text-lg font-bold">예산 요약</h2>
          {selectedBudget ? <div className="mt-3 grid gap-2"><Summary label="사용 가능액" value={selectedBudget.availableAmount} /><Summary label="이번 기안금액" value={amount} /><Summary label="승인 후 예상잔액" value={balance} /></div> : <p className="mt-3 text-sm text-[var(--color-stone)]">예산 항목을 선택하면 잔액을 확인할 수 있어요.</p>}
        </section>
      ) : null}

      <section className="sticky bottom-3 rounded-2xl border border-[var(--color-soft-border)] bg-white p-4 shadow-lg shadow-slate-900/5">
        <p className="mb-3 truncate text-sm font-bold">{title || counterpartyName || "새 기안"}</p>
        <div className="grid grid-cols-2 gap-2">
          <Link className="rounded-full border border-[var(--color-soft-border)] px-4 py-3 text-center text-sm font-bold" href="/approval">취소</Link>
          <button className="rounded-full border border-[var(--color-soft-border)] px-4 py-3 text-sm font-bold" name="intent" value="draft">임시저장</button>
          <button className="col-span-2 rounded-full bg-[var(--color-pressed-charcoal)] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={completeCount < checks.length} name="intent" value="submit">결재 요청</button>
        </div>
      </section>
    </aside>
  );
}

function Field({ defaultValue, label, name, required, type = "text", min, placeholder }: { defaultValue?: string; label: string; name: string; required?: boolean; type?: string; min?: string; placeholder?: string }) {
  return <label className="text-sm font-semibold">{label}<input className={inputClass} defaultValue={defaultValue} min={min} name={name} placeholder={placeholder} required={required} type={type} /></label>;
}

function AutoValue({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-[var(--color-soft-border)] p-3"><p className="text-xs font-bold text-[var(--color-stone)]">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>;
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div><p className="text-xs font-bold text-[var(--color-stone)]">{label}</p><p className={`font-bold ${value < 0 ? "text-red-700" : ""}`}>{value.toLocaleString("ko-KR")}원</p></div>;
}

function currentSeoulDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}
