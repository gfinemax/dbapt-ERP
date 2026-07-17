import { ErpShell } from "@/components/erp-shell";
import {
  addMeetingRuleAction,
  saveApprovalBudgetAction,
  saveApprovalLineRuleAction,
  saveApprovalSettingsAction,
} from "./actions";
import {
  getApprovalSettings,
  listApprovalBudgets,
  listApprovalLineRules,
  listMeetingRules,
} from "@/features/approval/approval-settings-repository";
export const dynamic = "force-dynamic";
const input =
  "w-full rounded-xl border border-[var(--color-soft-border)] px-3 py-2 text-sm";
export default async function Page() {
  const [settings, rules, budgets, lineRules] = await Promise.all([
    getApprovalSettings(),
    listMeetingRules(),
    listApprovalBudgets(),
    listApprovalLineRules(),
  ]);
  return (
    <ErpShell activeDetailLabel="결재 설정" activeLabel="기안·결재">
      <main className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-[28px] border border-[var(--color-soft-border)] bg-white p-6">
          <h1 className="text-3xl font-bold">기안 설정</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              "기안 유형",
              "결재선",
              "의결규칙",
              "소액기준",
              "문서번호",
              "변경통제",
              "권한",
              "예산",
            ].map((x) => (
              <span
                className="rounded-full bg-[var(--color-cloud-veil)] px-3 py-1 text-xs font-bold"
                key={x}
              >
                {x}
              </span>
            ))}
          </div>
        </header>
        <section className="grid gap-5 lg:grid-cols-2">
          <form
            action={saveApprovalSettingsAction}
            className="space-y-4 rounded-2xl border border-[var(--color-soft-border)] bg-white p-5"
          >
            <h2 className="text-lg font-bold">금액 기준</h2>
            <label className="block text-sm font-semibold">
              의결 검토 기준
              <input
                className={input}
                defaultValue={settings.meetingThresholdAmount}
                min="0"
                name="meetingThresholdAmount"
                type="number"
              />
            </label>
            <label className="block text-sm font-semibold">
              소액결의 건당 한도
              <input
                className={input}
                defaultValue={settings.smallExpenseLimit}
                min="0"
                name="smallExpenseLimit"
                type="number"
              />
            </label>
            <button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 py-2 text-sm font-bold text-white">
              설정 저장
            </button>
          </form>
          <form
            action={addMeetingRuleAction}
            className="space-y-3 rounded-2xl border border-[var(--color-soft-border)] bg-white p-5"
          >
            <h2 className="text-lg font-bold">의결기관 추천 규칙 추가</h2>
            <input
              className={input}
              name="ruleName"
              placeholder="규칙명"
              required
            />
            <input
              className={input}
              name="keyword"
              placeholder="판단 키워드"
              required
            />
            <select className={input} name="recommendedBody">
              <option value="GENERAL_ASSEMBLY">총회</option>
              <option value="DELEGATES">대의원회</option>
              <option value="BOARD">이사회</option>
              <option value="INTERNAL">내부결재</option>
            </select>
            <input
              className={input}
              name="reason"
              placeholder="추천 사유"
              required
            />
            <input
              className={input}
              name="regulationReference"
              placeholder="관련 규약 조항"
            />
            <button className="rounded-full border border-[var(--color-soft-border)] px-5 py-2 text-sm font-bold">
              규칙 추가
            </button>
          </form>
        </section>
        <section className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <form
            action={saveApprovalBudgetAction}
            className="space-y-3 rounded-2xl border border-[var(--color-soft-border)] bg-white p-5"
          >
            <h2 className="text-lg font-bold">예산 등록·갱신</h2>
            <input
              className={input}
              defaultValue={new Date().getFullYear()}
              name="fiscalYear"
              type="number"
              required
            />
            <input
              className={input}
              name="budgetItem"
              placeholder="예산 항·목·세목"
              required
            />
            <input
              className={input}
              min="0"
              name="approvedAmount"
              placeholder="편성예산"
              type="number"
              required
            />
            <input
              className={input}
              min="0"
              name="executedAmount"
              placeholder="실제 집행액"
              type="number"
              required
            />
            <button className="rounded-full bg-[var(--color-deep-cobalt)] px-5 py-2 text-sm font-bold text-white">
              예산 저장
            </button>
          </form>
          <div className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-white">
            <h2 className="p-5 text-lg font-bold">예산 현황</h2>
            {!budgets.length ? (
              <p className="px-5 pb-5 text-sm text-[var(--color-stone)]">
                등록된 예산이 없어. 실제 편성예산을 등록하면 기안 작성에서
                선택할 수 있어.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="bg-[var(--color-cloud-veil)]">
                    <tr>
                      {[
                        "연도",
                        "예산항목",
                        "편성예산",
                        "실집행",
                        "집행예정",
                        "사용가능",
                      ].map((label) => (
                        <th className="px-3 py-3 text-left" key={label}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {budgets.map((budget) => (
                      <tr
                        className="border-t border-[var(--color-soft-border)]"
                        key={budget.id}
                      >
                        <td className="px-3 py-3">{budget.fiscalYear}</td>
                        <td className="px-3 py-3 font-bold">
                          {budget.budgetItem}
                        </td>
                        <td className="px-3 py-3">
                          {budget.approvedAmount.toLocaleString("ko-KR")}원
                        </td>
                        <td className="px-3 py-3">
                          {budget.executedAmount.toLocaleString("ko-KR")}원
                        </td>
                        <td className="px-3 py-3">
                          {budget.reservedAmount.toLocaleString("ko-KR")}원
                        </td>
                        <td className="px-3 py-3 font-bold">
                          {budget.availableAmount.toLocaleString("ko-KR")}원
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
        <section className="rounded-2xl border border-[var(--color-soft-border)] bg-white p-5">
          <h2 className="text-lg font-bold">등록된 의결규칙</h2>
          {!rules.length ? (
            <p className="mt-3 text-sm text-[var(--color-stone)]">
              등록된 규칙이 없어. 법적 판단을 확정하지 않고 담당자가 최종
              선택해.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--color-soft-border)]">
              {rules.map((rule) => (
                <li className="py-3 text-sm" key={rule.id}>
                  <b>{rule.rule_name}</b> · {rule.keyword} →{" "}
                  {rule.recommended_body}
                  <p className="text-[var(--color-stone)]">
                    {rule.reason} {rule.regulation_reference}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="grid gap-5 lg:grid-cols-[420px_1fr]">
          <form
            action={saveApprovalLineRuleAction}
            className="space-y-3 rounded-2xl border border-[var(--color-soft-border)] bg-white p-5"
          >
            <h2 className="text-lg font-bold">역할 기반 결재선 규칙</h2>
            <input
              className={input}
              name="ruleName"
              placeholder="규칙명"
              required
            />
            <select className={input} name="documentType">
              <option value="">전체 문서유형</option>
              <option value="GENERAL">일반기안</option>
              <option value="EXPENSE">지출품의</option>
              <option value="CONTRACT">계약기안</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                className={input}
                min="0"
                name="minAmount"
                placeholder="최소금액"
                type="number"
              />
              <input
                className={input}
                min="0"
                name="maxAmount"
                placeholder="최대금액(선택)"
                type="number"
              />
            </div>
            {[1, 2, 3, 4].map((index) => (
              <div className="grid grid-cols-2 gap-2" key={index}>
                <input
                  className={input}
                  name={`stepRole${index}`}
                  placeholder={`${index}단계 역할`}
                />
                <input
                  className={input}
                  name={`stepPosition${index}`}
                  placeholder="직위/직책"
                />
              </div>
            ))}
            <p className="text-xs text-[var(--color-stone)]">
              특정 사용자 이름 대신 문서유형·금액·역할·직위를 기준으로 저장해.
            </p>
            <button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 py-2 text-sm font-bold text-white">
              결재선 규칙 저장
            </button>
          </form>
          <div className="rounded-2xl border border-[var(--color-soft-border)] bg-white p-5">
            <h2 className="text-lg font-bold">등록된 결재선</h2>
            {!lineRules.length ? (
              <p className="mt-3 text-sm text-[var(--color-stone)]">
                규칙이 없어. 등록 전에는 작성자가 결재선을 직접 확인해.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {lineRules.map((rule) => (
                  <li
                    className="rounded-xl bg-[var(--color-cloud-veil)] p-4 text-sm"
                    key={rule.id}
                  >
                    <b>{rule.ruleName}</b> · {rule.documentType ?? "전체"} ·{" "}
                    {rule.minAmount.toLocaleString("ko-KR")}원 이상
                    {rule.maxAmount
                      ? ` ~ ${rule.maxAmount.toLocaleString("ko-KR")}원`
                      : ""}
                    <p className="mt-2 text-xs text-[var(--color-stone)]">
                      {rule.steps
                        .map(
                          (step) =>
                            `${step.approverLabel}(${step.approverRole})`,
                        )
                        .join(" → ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </ErpShell>
  );
}
