"use client";
import Link from "next/link";
import { useState } from "react";
import { ErpShell } from "@/components/erp-shell";
import { createApprovalAction } from "@/app/approval/actions";
import type {
  ApprovalBudgetOption,
  ApprovalLineRule,
} from "./approval-settings-repository";
const inputClass =
  "mt-1 w-full rounded-xl border border-[var(--color-soft-border)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--color-deep-cobalt)]";
export function ApprovalNewPage({
  accountSubjects = [],
  budgets = [],
  lineRules = [],
  partners = [],
}: {
  accountSubjects?: string[];
  budgets?: ApprovalBudgetOption[];
  lineRules?: ApprovalLineRule[];
  partners?: string[];
}) {
  const [amount, setAmount] = useState(0);
  const [budgetId, setBudgetId] = useState("");
  const selectedBudget = budgets.find((item) => item.id === budgetId);
  return (
    <ErpShell activeDetailLabel="새 기안" activeLabel="기안·결재">
      <main className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-[28px] border border-[var(--color-soft-border)] bg-white p-6">
          <p className="text-sm font-bold text-[var(--color-deep-cobalt)]">
            1 유형 · 2 기본정보 · 3 예산·회계 · 4 의결 확인 · 5 결재선
          </p>
          <h1 className="mt-2 text-3xl font-bold">새 기안 작성</h1>
        </header>
        <form action={createApprovalAction} className="space-y-5">
          <Section title="1·2. 유형 및 기본정보">
            <label className="text-sm font-semibold">
              기안 유형
              <select className={inputClass} name="documentType" required>
                <option value="GENERAL">일반기안</option>
                <option value="EXPENSE">지출품의</option>
                <option value="CONTRACT">계약기안</option>
              </select>
            </label>
            <Field label="제목" name="title" required />
            <Field label="기안자" name="drafterLabel" required />
            <Field label="부서" name="departmentLabel" required />
            <Field
              label="시행 희망일"
              name="desiredExecutionDate"
              type="date"
            />
            <Field label="프로젝트" name="projectName" />
            <label className="text-sm font-semibold">
              공개·보안
              <select className={inputClass} name="securityLevel">
                <option value="INTERNAL">내부</option>
                <option value="PUBLIC">공개</option>
                <option value="CONFIDENTIAL">보안</option>
              </select>
            </label>
            <Field label="관련 문서" name="relatedDocument" />
            <label className="text-sm font-semibold md:col-span-2">
              목적 및 필요성
              <input className={inputClass} name="purpose" required />
            </label>
            <label className="text-sm font-semibold md:col-span-2">
              주요 내용
              <textarea className={`${inputClass} min-h-28`} name="body" />
            </label>
            <label className="text-sm font-semibold md:col-span-2">
              기대효과
              <textarea
                className={`${inputClass} min-h-20`}
                name="expectedEffect"
              />
            </label>
            <label className="text-sm font-semibold">
              첨부파일
              <input
                accept="image/*,.pdf"
                className={inputClass}
                name="attachment"
                type="file"
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input name="urgent" type="checkbox" />
              긴급 문서
            </label>
          </Section>
          <Section title="3. 예산·회계정보">
            <Field label="회계연도" name="fiscalYear" type="number" />
            <label className="text-sm font-semibold">
              총금액
              <input
                className={inputClass}
                min="0"
                name="amount"
                onChange={(event) => setAmount(Number(event.target.value) || 0)}
                type="number"
              />
            </label>
            <label className="text-sm font-semibold">
              예산 항·목·세목
              <select
                className={inputClass}
                name="budgetItem"
                onChange={(event) =>
                  setBudgetId(event.target.selectedOptions[0]?.dataset.id ?? "")
                }
              >
                <option value="">예산 선택</option>
                {budgets.map((budget) => (
                  <option
                    data-id={budget.id}
                    key={budget.id}
                    value={budget.budgetItem}
                  >
                    {budget.fiscalYear} · {budget.budgetItem}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold">
              대표 거래처
              <input
                className={inputClass}
                list="approval-partners"
                name="counterpartyName"
              />
            </label>
            <Field label="지급 예정일" name="paymentDueDate" type="date" />
            <label className="text-sm font-semibold">
              지급 방법
              <select className={inputClass} name="paymentMethod">
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
            {selectedBudget ? (
              <div className="grid gap-2 rounded-xl bg-[var(--color-cloud-veil)] p-4 text-sm md:col-span-2 sm:grid-cols-3">
                <Summary
                  label="편성예산"
                  value={selectedBudget.approvedAmount}
                />
                <Summary
                  label="실제 집행액"
                  value={selectedBudget.executedAmount}
                />
                <Summary
                  label="승인 집행예정액"
                  value={selectedBudget.reservedAmount}
                />
                <Summary
                  label="사용 가능액"
                  value={selectedBudget.availableAmount}
                />
                <Summary label="이번 기안금액" value={amount} />
                <Summary
                  label="승인 후 예상잔액"
                  value={selectedBudget.availableAmount - amount}
                />
              </div>
            ) : (
              <p className="text-xs text-[var(--color-stone)] md:col-span-2">
                등록된 예산을 선택하면 실시간 잔액이 표시돼. 예산은 기안
                설정에서 등록해.
              </p>
            )}
            <div className="flex flex-wrap gap-4 md:col-span-2">
              {[
                ["outOfBudget", "예산 외"],
                ["memberBurden", "조합원 추가부담"],
                ["contractRelated", "계약 관련"],
                ["installmentPayment", "분할 지급"],
              ].map(([name, label]) => (
                <label
                  className="flex items-center gap-2 text-sm font-semibold"
                  key={name}
                >
                  <input name={name} type="checkbox" />
                  {label}
                </label>
              ))}
            </div>
            <div className="overflow-x-auto md:col-span-2">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr>
                    {[
                      "거래처",
                      "계정과목",
                      "예산항목",
                      "공급가액",
                      "부가세",
                      "설명",
                    ].map((label) => (
                      <th className="px-2 py-2 text-left" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3].map((index) => (
                    <tr key={index}>
                      <td>
                        <input
                          className={inputClass}
                          list="approval-partners"
                          name={`linePartner${index}`}
                        />
                      </td>
                      <td>
                        <input
                          className={inputClass}
                          list="approval-account-subjects"
                          name={`accountSubject${index}`}
                        />
                      </td>
                      <td>
                        <input
                          className={inputClass}
                          name={`lineBudgetItem${index}`}
                        />
                      </td>
                      <td>
                        <input
                          className={inputClass}
                          min="0"
                          name={`supplyAmount${index}`}
                          type="number"
                        />
                      </td>
                      <td>
                        <input
                          className={inputClass}
                          min="0"
                          name={`vatAmount${index}`}
                          type="number"
                        />
                      </td>
                      <td>
                        <input
                          className={inputClass}
                          name={`lineDescription${index}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-[var(--color-stone)]">
                입력한 세부행의 공급가액+부가세 합계는 총금액과 일치해야 해.
              </p>
            </div>
            <div className="grid gap-3 rounded-xl border border-[var(--color-soft-border)] p-4 md:col-span-2 md:grid-cols-3">
              <Field label="계약 시작일" name="contractStartDate" type="date" />
              <Field label="계약 종료일" name="contractEndDate" type="date" />
              <Field label="계약 지급조건" name="contractPaymentTerms" />
              <div className="overflow-x-auto md:col-span-3">
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr>
                      <th className="text-left">분할 지급일</th>
                      <th className="text-left">금액</th>
                      <th className="text-left">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3].map((index) => (
                      <tr key={index}>
                        <td>
                          <input
                            className={inputClass}
                            name={`scheduleDate${index}`}
                            type="date"
                          />
                        </td>
                        <td>
                          <input
                            className={inputClass}
                            min="0"
                            name={`scheduleAmount${index}`}
                            type="number"
                          />
                        </td>
                        <td>
                          <input
                            className={inputClass}
                            name={`scheduleMemo${index}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Section>
          <Section title="4. 의결 필요 여부">
            <label className="text-sm font-semibold">
              최종 의결기관
              <select className={inputClass} name="finalMeetingBody">
                <option value="">불필요/자동추천</option>
                <option value="BOARD">이사회</option>
                <option value="DELEGATES">대의원회</option>
                <option value="GENERAL_ASSEMBLY">총회</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input name="meetingConfirmed" type="checkbox" />
              담당자가 추천을 확인함
            </label>
            <p className="text-xs text-[var(--color-stone)] md:col-span-2">
              자동 추천은 법적 판단 확정이 아니며, 담당자가 규약을 확인해 최종
              선택해.
            </p>
          </Section>
          <Section title="5. 결재선">
            {lineRules.length ? (
              <label className="text-sm font-semibold md:col-span-2">
                결재선 규칙
                <select className={inputClass} name="approvalLineRuleId">
                  <option value="">직접 지정</option>
                  {lineRules.map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      {rule.ruleName} · {rule.documentType ?? "전체"} ·{" "}
                      {rule.steps.map((step) => step.approverLabel).join(" → ")}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <Field
              label="1차 결재자"
              name="approver1"
              required={!lineRules.length}
            />
            <Field label="직책" name="approverRole1" required />
            <Field label="2차 결재자" name="approver2" />
            <Field label="직책" name="approverRole2" />
          </Section>
          <datalist id="approval-partners">
            {partners.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <datalist id="approval-account-subjects">
            {accountSubjects.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <div className="flex flex-wrap justify-end gap-2">
            <Link
              className="rounded-full border border-[var(--color-soft-border)] px-5 py-3 text-sm font-bold"
              href="/approval"
            >
              취소
            </Link>
            <button
              className="rounded-full border border-[var(--color-soft-border)] px-5 py-3 text-sm font-bold"
              name="intent"
              value="draft"
            >
              임시저장
            </button>
            <button
              className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 py-3 text-sm font-bold text-white"
              name="intent"
              value="submit"
            >
              결재 요청
            </button>
          </div>
        </form>
      </main>
    </ErpShell>
  );
}
function Section({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="grid gap-4 rounded-2xl border border-[var(--color-soft-border)] bg-white p-5 md:grid-cols-2">
      <h2 className="text-lg font-bold md:col-span-2">{title}</h2>
      {children}
    </section>
  );
}
function Field({
  label,
  name,
  required,
  type = "text",
  min,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  min?: string;
}) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <input
        className={inputClass}
        min={min}
        name={name}
        required={required}
        type={type}
      />
    </label>
  );
}
function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs font-bold text-[var(--color-stone)]">{label}</p>
      <p className={`font-bold ${value < 0 ? "text-red-700" : ""}`}>
        {value.toLocaleString("ko-KR")}원
      </p>
    </div>
  );
}
