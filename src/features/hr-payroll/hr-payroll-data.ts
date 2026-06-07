export type HrPayrollSection = "employees" | "payroll-entry" | "payroll-ledger";

export type PayrollEmployee = {
  department: string;
  employeeNo: string;
  employmentType: "정규직" | "계약직" | "임시직";
  hireDate: string;
  id: string;
  name: string;
  nationality: string;
  position: string;
  residentNo: string;
};

export type PayrollAmountRow = {
  amount: number;
  label: string;
};

export type PayrollLedgerRow = {
  deductions: PayrollAmountRow[];
  earnings: PayrollAmountRow[];
  employeeId: string;
  payrollMonth: string;
  paymentDate: string;
};

export const payrollWorkflows = [
  {
    description: "사원에 대한 급여 계산 및 급여 대장을 작성하기 위해 기본적인 사원정보를 등록합니다.",
    helperText: "공제 항목 - 소득세, 주민세 및 4대보험 등을 자동 계산",
    title: "사원정보등록",
  },
  {
    description: "등록된 사원정보를 기준으로 월별 급여 지급항목과 공제항목을 입력하고 회계 전표로 처리합니다.",
    helperText: "사원정보 입력창 제공, 급여입력 입력창 제공",
    title: "급여입력 및 전표처리",
  },
  {
    description: "해당 월에 대한 사원별 급여 지급내역을 등록하여 급여 대장을 작성하고 회계 전표 처리 합니다.",
    helperText: "최초 사용시 급여 내역을 등록하며 이후 급여 입력시 급여 복사 기능을 활용",
    title: "급여대장확인",
  },
] as const;

export const payrollEmployees: PayrollEmployee[] = [
  {
    department: "관리부",
    employeeNo: "1",
    employmentType: "정규직",
    hireDate: "2024-01-01",
    id: "employee-001",
    name: "김승민",
    nationality: "한국",
    position: "대리",
    residentNo: "900101-*******",
  },
  {
    department: "영업부",
    employeeNo: "2",
    employmentType: "정규직",
    hireDate: "2024-01-01",
    id: "employee-002",
    name: "김현진",
    nationality: "한국",
    position: "과장",
    residentNo: "800101-*******",
  },
];

export const payrollLedgerRows: PayrollLedgerRow[] = [
  {
    deductions: [
      { label: "소득세", amount: 74350 },
      { label: "주민세", amount: 7430 },
      { label: "국민연금", amount: 135000 },
      { label: "건강보험", amount: 106350 },
      { label: "장기요양보험", amount: 13770 },
      { label: "고용보험", amount: 27000 },
    ],
    earnings: [
      { label: "기본급", amount: 3000000 },
      { label: "식대비", amount: 200000 },
      { label: "자가운전보조금", amount: 200000 },
    ],
    employeeId: "employee-001",
    payrollMonth: "2025-04",
    paymentDate: "2025-04-25",
  },
  {
    deductions: [
      { label: "소득세", amount: 127220 },
      { label: "주민세", amount: 12720 },
      { label: "국민연금", amount: 157500 },
      { label: "건강보험", amount: 124070 },
      { label: "장기요양보험", amount: 16060 },
      { label: "고용보험", amount: 30900 },
    ],
    earnings: [
      { label: "기본급", amount: 3500000 },
      { label: "식대비", amount: 200000 },
      { label: "자가운전보조금", amount: 200000 },
    ],
    employeeId: "employee-002",
    payrollMonth: "2025-04",
    paymentDate: "2025-04-25",
  },
];

export function formatKrw(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

export function getPayrollEmployee(employeeId: string) {
  return payrollEmployees.find((employee) => employee.id === employeeId);
}

export function getAmount(rows: PayrollAmountRow[], label: string) {
  return rows.find((row) => row.label === label)?.amount ?? 0;
}

export function calculatePayrollTotals(employeeId: string) {
  const ledgerRow = payrollLedgerRows.find((row) => row.employeeId === employeeId);
  const totalEarnings = ledgerRow?.earnings.reduce((sum, row) => sum + row.amount, 0) ?? 0;
  const totalDeductions = ledgerRow?.deductions.reduce((sum, row) => sum + row.amount, 0) ?? 0;

  return {
    totalDeductions,
    totalEarnings,
    netPay: totalEarnings - totalDeductions,
  };
}

export function getPayrollSummary() {
  return payrollLedgerRows.reduce(
    (summary, row) => {
      const totals = calculatePayrollTotals(row.employeeId);

      return {
        employeeCount: summary.employeeCount + 1,
        totalDeductions: summary.totalDeductions + totals.totalDeductions,
        totalEarnings: summary.totalEarnings + totals.totalEarnings,
        totalNetPay: summary.totalNetPay + totals.netPay,
      };
    },
    {
      employeeCount: 0,
      totalDeductions: 0,
      totalEarnings: 0,
      totalNetPay: 0,
    },
  );
}
