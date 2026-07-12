import type { ManagedExpenseResolution } from "./expense-resolution-page";

export type ExpenseResolutionFilters = {
  approvalStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  overdueOnly?: boolean;
  paymentStatus?: string;
  query?: string;
};

export type ExpenseResolutionAlert = {
  id: string;
  label: string;
  resolutionId: string;
  severity: "warning" | "danger";
};

export function filterExpenseResolutions(resolutions: ManagedExpenseResolution[], filters: ExpenseResolutionFilters) {
  const query = filters.query?.trim().toLocaleLowerCase("ko-KR") ?? "";
  return resolutions.filter((resolution) => {
    const searchable = [
      resolution.resolutionNo,
      resolution.subject,
      resolution.projectName,
      resolution.representativeVendorName,
      resolution.representativeAccountTitle,
      resolution.expenseType,
      resolution.approvalStatus,
      resolution.paymentStatus,
      resolution.voucherNo,
    ].filter(Boolean).join(" ").toLocaleLowerCase("ko-KR");
    if (query && !searchable.includes(query)) return false;
    if (filters.approvalStatus && resolution.approvalStatus !== filters.approvalStatus) return false;
    if (filters.paymentStatus && resolution.paymentStatus !== filters.paymentStatus) return false;
    if (filters.dateFrom && resolution.createdAt < filters.dateFrom) return false;
    if (filters.dateTo && resolution.createdAt > filters.dateTo) return false;
    if (filters.overdueOnly && !isSettlementOverdue(resolution)) return false;
    return true;
  });
}

export function buildExpenseResolutionAlerts(resolutions: ManagedExpenseResolution[], today: string): ExpenseResolutionAlert[] {
  return resolutions.flatMap((resolution) => {
    const alerts: ExpenseResolutionAlert[] = [];
    if (resolution.approvalStatus === "승인완료" && resolution.paymentStatus === "지급대기" && resolution.plannedPaymentDate && resolution.plannedPaymentDate < today) {
      alerts.push({ id: `${resolution.id}-payment`, label: `지급예정일 ${resolution.plannedPaymentDate} 경과`, resolutionId: resolution.id, severity: "danger" });
    }
    if (isSettlementOverdue(resolution, today)) {
      alerts.push({ id: `${resolution.id}-settlement`, label: `정산기한 ${resolution.settlementDueDate} 경과`, resolutionId: resolution.id, severity: "danger" });
    }
    if (resolution.paymentStatus === "지급완료" && !resolution.transferReceiptStatus?.includes("완료")) {
      alerts.push({ id: `${resolution.id}-receipt`, label: "이체확인증 첨부 필요", resolutionId: resolution.id, severity: "warning" });
    }
    return alerts;
  });
}

export function getExpenseResolutionDashboard(resolutions: ManagedExpenseResolution[], today: string) {
  const alerts = buildExpenseResolutionAlerts(resolutions, today);
  return {
    alertCount: alerts.length,
    overdueSettlementCount: alerts.filter((alert) => alert.id.endsWith("-settlement")).length,
    paidAmount: resolutions.filter((item) => item.paymentStatus === "지급완료").reduce((sum, item) => sum + (item.actualPaidAmount ?? item.totalPaymentAmount), 0),
    voucherWaitingCount: resolutions.filter((item) => item.paymentStatus === "지급완료" && item.voucherStatus !== "전표확정").length,
  };
}

function isSettlementOverdue(resolution: ManagedExpenseResolution, today = new Date().toISOString().slice(0, 10)) {
  return Boolean(resolution.settlementDueDate && resolution.settlementDueDate < today && !["정산완료", "정산없음"].includes(resolution.settlementStatus));
}
