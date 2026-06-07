"use client";

import { Copy, Download, FileText, Plus, Save, Search, Upload, X } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";

import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import {
  calculatePayrollTotals,
  formatKrw,
  getAmount,
  getPayrollEmployee,
  getPayrollSummary,
  payrollEmployees,
  payrollLedgerRows,
  payrollWorkflows,
  type HrPayrollSection,
} from "./hr-payroll-data";

type ModalType = "employee" | "payroll" | null;

const detailLabels: Record<HrPayrollSection, string> = {
  employees: "사원정보등록",
  "payroll-entry": "급여입력",
  "payroll-ledger": "급여대장",
};

export function HrPayrollPage({ initialSection = "employees" }: { initialSection?: HrPayrollSection }) {
  const [modalType, setModalType] = useState<ModalType>(null);
  const activeDetailLabel = detailLabels[initialSection];

  return (
    <ErpShell activeDetailLabel={activeDetailLabel} activeLabel="회계/자금" activeWorkspaceLabel="인사/급여">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6">
        {initialSection === "payroll-entry" ? (
          <PayrollEntrySection onOpenEmployee={() => setModalType("employee")} onOpenPayroll={() => setModalType("payroll")} />
        ) : initialSection === "payroll-ledger" ? (
          <PayrollLedgerSection />
        ) : (
          <EmployeeSection onOpenEmployee={() => setModalType("employee")} />
        )}
      </div>

      {modalType === "employee" ? <EmployeeModal onClose={() => setModalType(null)} /> : null}
      {modalType === "payroll" ? <PayrollModal onClose={() => setModalType(null)} /> : null}
    </ErpShell>
  );
}

function EmployeeSection({ onOpenEmployee }: { onOpenEmployee: () => void }) {
  const summary = getPayrollSummary();
  const workflow = payrollWorkflows[0];

  return (
    <>
      <HeroSection
        actionLabel="추가"
        description={workflow.description}
        helperText={workflow.helperText}
        onAction={onOpenEmployee}
        route="회계/자금 > 인사/급여 > 사원정보등록"
        title="사원정보등록"
      />

      <WorkflowCards activeIndex={0} />

      <section className="grid gap-4 lg:grid-cols-4">
        <SummaryTile label="등록 사원" value={`${summary.employeeCount}명`} />
        <SummaryTile label="지급 합계" value={formatKrw(summary.totalEarnings)} />
        <SummaryTile label="공제 합계" value={formatKrw(summary.totalDeductions)} />
        <SummaryTile label="차인지급액" value={formatKrw(summary.totalNetPay)} />
      </section>

      <section className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-2 rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2.5 text-sm text-[var(--color-fog)] xl:w-[420px]">
            <Search className="size-4 shrink-0" />
            <span>사원번호/사원명 검색</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="rounded-full" size="sm" variant="outline">
              <Upload className="size-4" />
              사원대장 가져오기
            </Button>
            <Button className="rounded-full" size="sm" variant="outline">
              <Download className="size-4" />
              사원대장 내보내기
            </Button>
          </div>
        </div>

        <p className="mt-4 rounded-xl bg-[var(--color-cloud-veil)] px-4 py-3 text-sm font-semibold text-[var(--color-stone)]">사원정보 입력창 제공</p>
      </section>

      <EmployeeTable />
    </>
  );
}

function PayrollEntrySection({ onOpenEmployee, onOpenPayroll }: { onOpenEmployee: () => void; onOpenPayroll: () => void }) {
  const workflow = payrollWorkflows[1];
  const row = payrollLedgerRows[0];
  const employee = getPayrollEmployee(row.employeeId);
  const totals = calculatePayrollTotals(row.employeeId);

  return (
    <>
      <HeroSection
        actionLabel="급여 등록"
        description={workflow.description}
        helperText="공제 항목 - 소득세, 주민세 및 4대보험 등을 자동 계산"
        onAction={onOpenPayroll}
        route="회계/자금 > 인사/급여 > 급여입력"
        title="급여입력 및 전표처리"
      />

      <WorkflowCards activeIndex={1} />

      <section className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
        <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">사원정보 입력창 제공</h2>
            <Button className="rounded-full" onClick={onOpenEmployee} size="sm" variant="outline">
              <Plus className="size-4" />
              사원정보
            </Button>
          </div>
          <dl className="mt-4 grid gap-3 text-sm">
            <InfoLine label="사원명" value={employee?.name ?? "-"} />
            <InfoLine label="부서" value={employee?.department ?? "-"} />
            <InfoLine label="직책" value={employee?.position ?? "-"} />
            <InfoLine label="지급일자" value={row.paymentDate} />
          </dl>
        </div>

        <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">급여입력 입력창 제공</h2>
            <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-4 text-white hover:bg-[var(--color-midnight-ink)]" onClick={onOpenPayroll} size="sm">
              <Plus className="size-4" />
              급여입력
            </Button>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <AmountPanel rows={row.earnings} title="지급항목" />
            <AmountPanel rows={row.deductions} title="공제항목" />
          </div>

          <div className="mt-4 grid gap-3 rounded-xl bg-[var(--color-cloud-veil)] p-4 text-sm sm:grid-cols-3">
            <InfoLine label="지급합계" value={formatKrw(totals.totalEarnings)} />
            <InfoLine label="공제합계" value={formatKrw(totals.totalDeductions)} />
            <InfoLine label="차인지급액" value={formatKrw(totals.netPay)} />
          </div>
        </div>
      </section>
    </>
  );
}

function PayrollLedgerSection() {
  const workflow = payrollWorkflows[2];
  const summary = getPayrollSummary();

  return (
    <>
      <HeroSection
        actionLabel="전월 복사"
        description={workflow.description}
        helperText={workflow.helperText}
        route="회계/자금 > 인사/급여 > 급여대장"
        title="급여대장확인"
      />

      <WorkflowCards activeIndex={2} />

      <section className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-md border border-[var(--color-soft-border)] bg-white px-3 py-2 font-semibold">2025년</span>
            <span className="rounded-md border border-[var(--color-soft-border)] bg-white px-3 py-2 font-semibold">04월</span>
            <span className="rounded-md border border-[var(--color-soft-border)] bg-white px-3 py-2 font-semibold">급여구분: 일반직</span>
            <span className="rounded-md border border-[var(--color-soft-border)] bg-white px-3 py-2 font-semibold">정규직</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="rounded-full" size="sm" variant="outline">
              <Copy className="size-4" />
              급여 복사
            </Button>
            <Button className="rounded-full" size="sm" variant="outline">
              <FileText className="size-4" />
              전표처리
            </Button>
            <Button className="rounded-full" size="sm" variant="outline">
              <Download className="size-4" />
              출력
            </Button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px] border-collapse text-left text-sm">
            <thead className="bg-[var(--color-cloud-veil)] text-xs font-semibold text-[var(--color-stone)]">
              <tr>
                <th className="px-4 py-3 text-center">사원번호</th>
                <th className="px-4 py-3 text-center">성명</th>
                <th className="px-4 py-3 text-center">부서</th>
                <th className="px-4 py-3 text-center">입사일</th>
                <th className="px-4 py-3 text-center">기본급</th>
                <th className="px-4 py-3 text-center">식대비</th>
                <th className="px-4 py-3 text-center">자가운전보조금</th>
                <th className="px-4 py-3 text-center">소득세</th>
                <th className="px-4 py-3 text-center">주민세</th>
                <th className="px-4 py-3 text-center">국민연금</th>
                <th className="px-4 py-3 text-center">건강보험</th>
                <th className="px-4 py-3 text-center">공제합계</th>
                <th className="px-4 py-3 text-center">차인지급액</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-soft-border)]">
              {payrollLedgerRows.map((row) => {
                const employee = getPayrollEmployee(row.employeeId);
                const totals = calculatePayrollTotals(row.employeeId);

                return (
                  <tr className="bg-white/70" key={row.employeeId}>
                    <td className="px-4 py-4 font-semibold">{employee?.employeeNo}</td>
                    <td className="px-4 py-4 font-semibold">{employee?.name}</td>
                    <td className="px-4 py-4 text-[var(--color-stone)]">{employee?.department}</td>
                    <td className="px-4 py-4">{employee?.hireDate}</td>
                    <td className="px-4 py-4 text-right">{formatKrw(getAmount(row.earnings, "기본급"))}</td>
                    <td className="px-4 py-4 text-right">{formatKrw(getAmount(row.earnings, "식대비"))}</td>
                    <td className="px-4 py-4 text-right">{formatKrw(getAmount(row.earnings, "자가운전보조금"))}</td>
                    <td className="px-4 py-4 text-right">{formatKrw(getAmount(row.deductions, "소득세"))}</td>
                    <td className="px-4 py-4 text-right">{formatKrw(getAmount(row.deductions, "주민세"))}</td>
                    <td className="px-4 py-4 text-right">{formatKrw(getAmount(row.deductions, "국민연금"))}</td>
                    <td className="px-4 py-4 text-right">{formatKrw(getAmount(row.deductions, "건강보험"))}</td>
                    <td className="px-4 py-4 text-right font-semibold">{formatKrw(totals.totalDeductions)}</td>
                    <td className="px-4 py-4 text-right font-bold">{formatKrw(totals.netPay)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-[var(--color-cloud-veil)] text-sm font-bold">
              <tr>
                <td className="px-4 py-4" colSpan={4}>
                  합계
                </td>
                <td className="px-4 py-4 text-right" colSpan={4}>
                  {formatKrw(summary.totalEarnings)}
                </td>
                <td className="px-4 py-4 text-right" colSpan={4}>
                  {formatKrw(summary.totalDeductions)}
                </td>
                <td className="px-4 py-4 text-right">{formatKrw(summary.totalNetPay)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </>
  );
}

function HeroSection({
  actionLabel,
  description,
  helperText,
  onAction,
  route,
  title,
}: {
  actionLabel: string;
  description: string;
  helperText: string;
  onAction?: () => void;
  route: string;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 lg:flex-row lg:items-end lg:justify-between lg:p-7">
      <div>
        <p className="mb-3 inline-flex rounded-full bg-[var(--color-morning-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]">{route}</p>
        <h1 className="text-3xl font-bold tracking-normal">{title}</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--color-stone)]">{description}</p>
        <p className="mt-2 max-w-3xl text-sm font-semibold text-[var(--color-stone)]">({helperText})</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="rounded-full" size="lg" variant="outline">
          <Search className="size-4" />
          조회
        </Button>
        <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" onClick={onAction} size="lg">
          <Plus className="size-4" />
          {actionLabel}
        </Button>
      </div>
    </section>
  );
}

function WorkflowCards({ activeIndex }: { activeIndex: number }) {
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      {payrollWorkflows.map((workflow, index) => (
        <a
          className={
            index === activeIndex
              ? "rounded-2xl border border-[var(--color-deep-cobalt)] bg-[var(--color-morning-tint)] p-5"
              : "rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 transition hover:border-[var(--color-deep-cobalt)]"
          }
          href={index === 0 ? "/hr-payroll?section=employees" : index === 1 ? "/hr-payroll?section=payroll-entry" : "/hr-payroll?section=payroll-ledger"}
          key={workflow.title}
        >
          <p className="text-xs font-bold text-[var(--color-fog)]">업무흐름 {index + 1}</p>
          <p className="mt-3 text-lg font-bold">{workflow.title}</p>
          <p className="mt-2 text-sm leading-6 text-[var(--color-stone)]">{workflow.description}</p>
        </a>
      ))}
    </section>
  );
}

function EmployeeTable() {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
          <thead className="bg-[var(--color-cloud-veil)] text-xs font-semibold text-[var(--color-stone)]">
            <tr>
              <th className="px-4 py-3 text-center">사원번호</th>
              <th className="px-4 py-3 text-center">사원명</th>
              <th className="px-4 py-3 text-center">주민번호</th>
              <th className="px-4 py-3 text-center">부서</th>
              <th className="px-4 py-3 text-center">직책</th>
              <th className="px-4 py-3 text-center">입사일자</th>
              <th className="px-4 py-3 text-center">내/외국인</th>
              <th className="px-4 py-3 text-center">급여구분</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-soft-border)]">
            {payrollEmployees.map((employee) => (
              <tr className="bg-white/70" key={employee.id}>
                <td className="px-4 py-4 font-semibold">{employee.employeeNo}</td>
                <td className="px-4 py-4 font-semibold">{employee.name}</td>
                <td className="px-4 py-4">{employee.residentNo}</td>
                <td className="px-4 py-4 text-[var(--color-stone)]">{employee.department}</td>
                <td className="px-4 py-4">{employee.position}</td>
                <td className="px-4 py-4">{employee.hireDate}</td>
                <td className="px-4 py-4">{employee.nationality}</td>
                <td className="px-4 py-4">{employee.employmentType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AmountPanel({ rows, title }: { rows: { amount: number; label: string }[]; title: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-soft-border)]">
      <div className="bg-[var(--color-cloud-veil)] px-4 py-3 text-sm font-bold">{title}</div>
      <div className="divide-y divide-[var(--color-soft-border)]">
        {rows.map((row) => (
          <div className="flex items-center justify-between gap-4 bg-white px-4 py-3 text-sm" key={row.label}>
            <span>{row.label}</span>
            <span className="font-semibold">{formatKrw(row.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
      <p className="text-sm font-semibold text-[var(--color-stone)]">{label}</p>
      <p className="mt-3 text-2xl font-bold tracking-normal">{value}</p>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[var(--color-stone)]">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function EmployeeModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalFrame onClose={onClose} title="사원정보 입력">
      <form className="grid gap-4" onSubmit={blockSubmit}>
        <FormInput label="사원명" value="김승민" />
        <FormInput label="입사일자" value="2024-01-01" />
        <FormInput label="주민번호" value="900101-*******" />
        <div className="rounded-xl bg-[var(--color-cloud-veil)] p-4 text-sm font-semibold text-[var(--color-stone)]">공제 항목 자동계산</div>
        <ModalActions onClose={onClose} primaryLabel="저장" />
      </form>
    </ModalFrame>
  );
}

function PayrollModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalFrame onClose={onClose} title="급여입력 입력창">
      <form className="grid gap-4" onSubmit={blockSubmit}>
        <label className="grid gap-1.5 text-sm font-semibold">
          사원선택
          <select className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm font-medium text-[var(--color-midnight-ink)]" defaultValue="employee-001">
            {payrollEmployees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </label>
        <FormInput label="기본급" value="3,000,000" />
        <FormInput label="식대비" value="200,000" />
        <FormInput label="자가운전보조금" value="200,000" />
        <div className="flex flex-wrap gap-2 rounded-xl bg-[var(--color-cloud-veil)] p-4 text-sm font-semibold text-[var(--color-stone)]">
          <span>소득세</span>
          <span>주민세</span>
          <span>4대보험 자동 계산</span>
          <span>전표처리</span>
        </div>
        <ModalActions onClose={onClose} primaryLabel="저장" />
      </form>
    </ModalFrame>
  );
}

function ModalFrame({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(16,20,24,0.38)] p-4">
      <div aria-label={title} className="w-full max-w-xl rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 shadow-2xl" role="dialog">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button aria-label="닫기" className="flex size-8 items-center justify-center rounded-full border border-[var(--color-soft-border)] text-[var(--color-stone)]" onClick={onClose} type="button">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormInput({ label, value }: { label: string; value: string }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      {label}
      <input className="h-10 rounded-md border border-[var(--color-soft-border)] bg-white px-3 text-sm font-medium text-[var(--color-midnight-ink)]" defaultValue={value} />
    </label>
  );
}

function ModalActions({ onClose, primaryLabel }: { onClose: () => void; primaryLabel: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button onClick={onClose} type="button" variant="outline">
        <X className="size-4" />
        취소
      </Button>
      <Button className="bg-[var(--color-pressed-charcoal)] text-white hover:bg-[var(--color-midnight-ink)]" type="submit">
        <Save className="size-4" />
        {primaryLabel}
      </Button>
    </div>
  );
}

function blockSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
}
