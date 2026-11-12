import { ErpShell } from "@/components/erp-shell";
import Link from "next/link";
import {
  addMeetingRuleAction,
  approveBudgetAdjustmentAction,
  approveBudgetPlanAction,
  cancelBudgetAdjustmentAction,
  createBudgetAdjustmentAction,
  createBudgetPlanAction,
  rejectBudgetAdjustmentAction,
  saveBudgetPlanItemAction,
  saveApprovalLineRuleAction,
  saveApprovalSettingsAction,
  submitBudgetAdjustmentAction,
  submitBudgetPlanAction,
} from "./actions";
import {
  getApprovalSettings,
  listBudgetGovernance,
  listApprovalBudgets,
  listApprovalLineRules,
  listMeetingRules,
} from "@/features/approval/approval-settings-repository";
export const dynamic = "force-dynamic";
const input =
  "w-full rounded-xl border border-[var(--color-soft-border)] px-3 py-2 text-sm";
const planStatusLabels={DRAFT:"작성중",SUBMITTED:"승인대기",ACTIVE:"확정 시행",ARCHIVED:"이전 확정본",REJECTED:"반려"} as const;
const adjustmentStatusLabels={DRAFT:"작성중",SUBMITTED:"승인대기",APPROVED:"승인·반영",REJECTED:"반려",CANCELLED:"취소"} as const;
const adjustmentTypeLabels={TRANSFER:"타 예산 전용",RESERVE_USE:"예비비 사용",SUPPLEMENT:"추가경정 증액",REDUCTION:"예산 감액"} as const;
export default async function Page() {
  const settings=await getApprovalSettings();
  const [rules, budgets, lineRules, governance] = await Promise.all([
    listMeetingRules(settings.organizationId),
    listApprovalBudgets(settings.organizationId),
    listApprovalLineRules(settings.organizationId),
    listBudgetGovernance(settings.organizationId),
  ]);
  const currentYear=Number(new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric"}).format(new Date()));
  const currentMonth=`${new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit"}).format(new Date())}-01`;
  const budgetNames=new Map(budgets.map(budget=>[budget.id,budget.planItemLabel||budget.budgetItem]));
  const sourceYears=[...new Set(budgets.map(budget=>budget.fiscalYear))].sort((a,b)=>b-a);
  return (
    <ErpShell activeDetailLabel="결재 설정" activeLabel="기안·결재">
      <main className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-[28px] border border-[var(--color-soft-border)] bg-white p-6">
          <h1 className="text-3xl font-bold">기안 설정</h1>
          <Link href="/finance/reimbursements?tab=budgets" className="mt-3 inline-block text-sm font-semibold text-blue-700 underline">개인 지출 정산·월 마감 관리</Link>
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
          <form action={createBudgetPlanAction} className="space-y-3 rounded-2xl border border-[var(--color-soft-border)] bg-white p-5">
            <h2 className="text-lg font-bold">연도별 예산안 만들기</h2>
            <p className="text-sm text-[var(--color-stone)]">전년도 확정예산을 복사해도 실제 예산에는 바로 반영되지 않아. 작성·제출·확정 단계를 거쳐야 해.</p>
            <label className="block text-sm font-semibold">대상 회계연도<input className={input} defaultValue={currentYear+1} min="2000" max="2100" name="fiscalYear" type="number" required/></label>
            <label className="block text-sm font-semibold">예산안 제목<input className={input} name="title" placeholder={`${currentYear+1}년 운영비 예산안`} required/></label>
            <label className="block text-sm font-semibold">복사할 확정예산<select className={input} name="sourceYear"><option value="">빈 예산안으로 시작</option>{sourceYears.map(year=><option key={year} value={year}>{year}년 확정예산</option>)}</select></label>
            <button className="rounded-full bg-[var(--color-deep-cobalt)] px-5 py-2 text-sm font-bold text-white">예산안 생성</button>
          </form>
          <div className="rounded-2xl border border-[var(--color-soft-border)] bg-white p-5">
            <h2 className="text-lg font-bold">예산안 버전</h2>
            <p className="mt-1 text-sm text-[var(--color-stone)]">확정된 버전은 보존하고, 다음 개정은 새 버전으로 작성해.</p>
            {!governance.plans.length?<p className="mt-4 text-sm">등록된 예산안 버전이 없습니다.</p>:<ul className="mt-4 space-y-2">{governance.plans.map(plan=><li className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--color-cloud-veil)] p-3 text-sm" key={plan.id}><span><b>{plan.title}</b> · {plan.fiscal_year}년 v{plan.revision}</span><span className="rounded-full bg-white px-3 py-1 text-xs font-bold">{planStatusLabels[plan.status]}</span></li>)}</ul>}
          </div>
        </section>

        {governance.plans.filter(plan=>plan.status==="DRAFT"||plan.status==="SUBMITTED").map(plan=>{
          const items=governance.items.filter(item=>item.plan_id===plan.id);
          return <details className="rounded-2xl border border-[var(--color-soft-border)] bg-white p-5" key={plan.id} open>
            <summary className="cursor-pointer text-lg font-bold">{plan.title} · {planStatusLabels[plan.status]} · {items.length}개 항목</summary>
            {plan.status==="DRAFT"?<div className="mt-4 space-y-3">
              {items.map(item=><form action={saveBudgetPlanItemAction} className="grid gap-2 rounded-xl border border-[var(--color-soft-border)] p-3 md:grid-cols-2 xl:grid-cols-4" key={item.id}>
                <input name="planId" type="hidden" value={plan.id}/><input name="itemId" type="hidden" value={item.id}/><input name="sortOrder" type="hidden" value={item.sort_order}/>
                <label className="text-xs font-semibold">예산코드<input className={input} name="budgetCode" defaultValue={item.budget_code??""} required/></label>
                <label className="text-xs font-semibold">예산항목<input className={input} name="budgetItem" defaultValue={item.budget_item} required/></label>
                <label className="text-xs font-semibold">연간 편성액<input className={input} min="0" name="approvedAmount" type="number" defaultValue={item.approved_amount} required/></label>
                <label className="text-xs font-semibold">월 기준액<input className={input} min="0" name="monthlyAmount" type="number" defaultValue={item.monthly_amount} required/></label>
                <label className="text-xs font-semibold">예산 구분<input className={input} name="planSection" defaultValue={item.plan_section??""}/></label>
                <label className="text-xs font-semibold">표시명<input className={input} name="planItemLabel" defaultValue={item.plan_item_label??""}/></label>
                <label className="text-xs font-semibold">분류 상태<select className={input} name="mappingStatus" defaultValue={item.mapping_status}><option value="CONFIRMED">확정</option><option value="POLICY_REVIEW">정책 검토</option></select></label>
                <label className="text-xs font-semibold">산출근거<input className={input} name="calculationBasis" defaultValue={item.calculation_basis}/></label>
                <label className="text-xs font-semibold md:col-span-2 xl:col-span-3">검토 메모<input className={input} name="mappingNote" defaultValue={item.mapping_note}/></label>
                <button className="self-end rounded-xl border border-[var(--color-soft-border)] px-4 py-2 text-sm font-bold">항목 저장</button>
              </form>)}
              <form action={saveBudgetPlanItemAction} className="grid gap-2 rounded-xl border border-dashed border-[var(--color-soft-border)] p-3 md:grid-cols-2 xl:grid-cols-4">
                <input name="planId" type="hidden" value={plan.id}/><input name="mappingStatus" type="hidden" value="POLICY_REVIEW"/>
                <input className={input} name="budgetCode" placeholder="새 예산코드" required/><input className={input} name="budgetItem" placeholder="새 예산항목" required/>
                <input className={input} min="0" name="approvedAmount" placeholder="연간 편성액" type="number" required/><input className={input} min="0" name="monthlyAmount" placeholder="월 기준액" type="number" required/>
                <input className={input} name="planSection" placeholder="예산 구분"/><input className={input} name="planItemLabel" placeholder="표시명"/><input className={input} name="calculationBasis" placeholder="산출근거"/><input className={input} name="mappingNote" placeholder="정책 검토 메모"/>
                <button className="rounded-xl border border-[var(--color-soft-border)] px-4 py-2 text-sm font-bold">새 항목 추가</button>
              </form>
              <form action={submitBudgetPlanAction}><input name="planId" type="hidden" value={plan.id}/><button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 py-2 text-sm font-bold text-white">예산안 승인 요청</button></form>
            </div>:<form action={approveBudgetPlanAction} className="mt-4 grid gap-3 md:grid-cols-2">
              <input name="planId" type="hidden" value={plan.id}/><input name="title" type="hidden" value={plan.title}/>
              <label className="text-sm font-semibold">승인 근거<input className={input} name="authorityReference" placeholder="예: 2027년 정기총회 제3호 의안" required/></label>
              <label className="text-sm font-semibold">비고<input className={input} name="notes" placeholder="시행 조건 또는 특이사항"/></label>
              <p className="text-sm text-amber-800 md:col-span-2">확정하면 해당 연도의 실제 예산으로 반영돼. 이미 집행·예약·마감된 연도는 예산안으로 덮어쓸 수 없고 아래 예산변경 절차를 사용해야 해.</p>
              <button className="w-fit rounded-full bg-[var(--color-deep-cobalt)] px-5 py-2 text-sm font-bold text-white">승인 예산으로 확정</button>
            </form>}
          </details>;
        })}

        <section className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-white">
          <div className="p-5"><h2 className="text-lg font-bold">확정예산과 변경 반영액</h2><p className="mt-1 text-sm text-[var(--color-stone)]">기본 편성액과 승인된 전용·예비비 사용을 합산한 실효예산이 지출 가능 한도가 돼.</p></div>
          {budgets.some(b=>b.unresolvedCount)&&<p className="px-5 pb-4 text-sm text-amber-800">귀속 미확인 내역이 있어 확인된 금액만 표시해. <Link className="underline" href="/finance/reimbursements?tab=budgets">월 예산·마감에서 귀속 확인하기</Link></p>}
          {!budgets.length?<p className="px-5 pb-5 text-sm">확정된 예산이 없습니다.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-[var(--color-cloud-veil)]"><tr>{["연도","승인 예산","기본 연간","변경","실효 연간","실효 월","연간 실집행","이번 달 예정","이번 달 사용가능"].map(label=><th className="px-3 py-3 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{budgets.map(budget=><tr className="border-t border-[var(--color-soft-border)]" key={budget.id}>
            <td className="px-3 py-3">{budget.fiscalYear}</td><td className="px-3 py-3"><p className="font-bold">{budget.planSection?`${budget.planSection} · ${budget.planItemLabel}`:budget.budgetItem}</p><p className="text-xs text-[var(--color-stone)]">{budget.budgetItem}</p>{budget.mappingStatus==="POLICY_REVIEW"?<p className="text-xs font-bold text-amber-700">정책 확인 필요 · {budget.mappingNote}</p>:null}</td>
            <td className="px-3 py-3">{(budget.baseApprovedAmount??budget.approvedAmount).toLocaleString("ko-KR")}원</td><td className={`px-3 py-3 font-bold ${(budget.annualAdjustmentAmount??0)<0?"text-red-700":"text-blue-700"}`}>{(budget.annualAdjustmentAmount??0).toLocaleString("ko-KR")}원</td><td className="px-3 py-3 font-bold">{budget.approvedAmount.toLocaleString("ko-KR")}원</td><td className="px-3 py-3">{(budget.monthlyBudgetAmount??0).toLocaleString("ko-KR")}원</td><td className="px-3 py-3">{budget.executedAmount.toLocaleString("ko-KR")}원</td><td className="px-3 py-3">{budget.reservedAmount.toLocaleString("ko-KR")}원</td><td className="px-3 py-3 font-bold">{budget.unresolvedCount?"귀속 확인 필요":`${budget.availableAmount.toLocaleString("ko-KR")}원`}</td>
          </tr>)}</tbody></table></div>}
        </section>

        <section className="grid gap-5 lg:grid-cols-[420px_1fr]">
          <form action={createBudgetAdjustmentAction} className="space-y-3 rounded-2xl border border-[var(--color-soft-border)] bg-white p-5">
            <h2 className="text-lg font-bold">예산변경 작성</h2><p className="text-sm text-[var(--color-stone)]">부족예산을 자동 전용하지 않아. 근거를 남겨 작성하고 별도 승인 후 반영해.</p>
            <label className="block text-sm font-semibold">변경 유형<select className={input} name="adjustmentType"><option value="TRANSFER">타 예산 전용</option><option value="RESERVE_USE">예비비 사용</option><option value="SUPPLEMENT">추가경정 증액</option><option value="REDUCTION">예산 감액</option></select></label>
            <label className="block text-sm font-semibold">회계연도<input className={input} defaultValue={currentYear} name="fiscalYear" type="number" required/></label>
            <label className="block text-sm font-semibold">반영월<input className={input} defaultValue={currentMonth} name="effectiveMonth" type="date" required/></label>
            <label className="block text-sm font-semibold">차감 예산<select className={input} name="sourceBudgetId"><option value="">차감 없음(추가경정)</option>{budgets.map(b=><option key={b.id} value={b.id}>{b.fiscalYear} · {b.planItemLabel||b.budgetItem}</option>)}</select></label>
            <label className="block text-sm font-semibold">증액 예산<select className={input} name="targetBudgetId"><option value="">증액 없음(감액)</option>{budgets.map(b=><option key={b.id} value={b.id}>{b.fiscalYear} · {b.planItemLabel||b.budgetItem}{b.mappingStatus==="POLICY_REVIEW"?" · 정책검토":""}</option>)}</select></label>
            <label className="block text-sm font-semibold">변경 금액<input className={input} min="1" name="amount" type="number" required/></label>
            <label className="block text-sm font-semibold">변경 사유<textarea className={input} name="reason" rows={3} required/></label>
            <label className="block text-sm font-semibold">승인 근거<input className={input} name="authorityReference" placeholder="규약 조항·의안·결재문서" required/></label>
            <button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 py-2 text-sm font-bold text-white">예산변경 초안 저장</button>
          </form>
          <div className="rounded-2xl border border-[var(--color-soft-border)] bg-white p-5">
            <h2 className="text-lg font-bold">예산변경 이력</h2>
            {!governance.adjustments.length?<p className="mt-3 text-sm">등록된 예산변경이 없습니다.</p>:<ul className="mt-3 space-y-3">{governance.adjustments.map(change=><li className="rounded-xl border border-[var(--color-soft-border)] p-4 text-sm" key={change.id}>
              <div className="flex flex-wrap items-center justify-between gap-2"><p><b>{change.adjustment_no}</b> · {adjustmentTypeLabels[change.adjustment_type]} · {change.amount.toLocaleString("ko-KR")}원</p><span className="rounded-full bg-[var(--color-cloud-veil)] px-3 py-1 text-xs font-bold">{adjustmentStatusLabels[change.status]}</span></div>
              <p className="mt-2">{budgetNames.get(change.source_budget_id??"")??"차감 없음"} → {budgetNames.get(change.target_budget_id??"")??"증액 없음"} · {change.effective_month.slice(0,7)} 귀속</p><p className="mt-1 text-[var(--color-stone)]">{change.reason} · 근거: {change.authority_reference}</p>
              {change.status==="DRAFT"?<div className="mt-3 flex gap-2"><form action={submitBudgetAdjustmentAction}><input name="id" type="hidden" value={change.id}/><button className="rounded-full bg-[var(--color-deep-cobalt)] px-4 py-2 text-xs font-bold text-white">승인 요청</button></form><form action={cancelBudgetAdjustmentAction}><input name="id" type="hidden" value={change.id}/><button className="rounded-full border px-4 py-2 text-xs font-bold">초안 취소</button></form></div>:null}
              {change.status==="SUBMITTED"?<div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]"><input className={input} name="decisionNote" placeholder="승인 검토 메모" form={`approve-${change.id}`}/><form action={approveBudgetAdjustmentAction} id={`approve-${change.id}`}><input name="id" type="hidden" value={change.id}/><button className="rounded-full bg-[var(--color-deep-cobalt)] px-4 py-2 text-xs font-bold text-white">승인·반영</button></form><form action={rejectBudgetAdjustmentAction}><input name="id" type="hidden" value={change.id}/><input name="reason" type="hidden" value="예산변경 승인 반려"/><button className="rounded-full border border-red-200 px-4 py-2 text-xs font-bold text-red-700">반려</button></form></div>:null}
            </li>)}</ul>}
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
