import { reimbursementDb } from "./reimbursement-repository";
import { requireReimbursementIdentity } from "./reimbursement-auth";

export type FinanceReadiness = {
  configuration: {
    activeStaff: number;
    missingRoles: string[];
    verifiedTrustContracts: number;
    operatingFundContracts: number;
    currentYearBudgets: number;
  };
  queues: {
    cardLinkPending: number;
    evidencePending: number;
    resolutionRequired: number;
    personalPaymentPending: number;
    advanceSettlementOpen: number;
    operatingPeriodOpen: number;
    routeUnclassified: number;
  };
  fiscalYear: number;
};

const roleLabels: Record<string, string> = { ADMIN: "관리", APPROVE: "승인", PAY: "지급", CLOSE: "마감" };

export async function loadFinanceReadiness(): Promise<FinanceReadiness> {
  const member = await requireReimbursementIdentity();
  if (member.permissions.length === 0) throw new Error("운영 준비 점검은 회계·자금 담당자만 볼 수 있어.");
  const db = reimbursementDb();
  const finance = db.schema("finance");
  const org = member.organization_id;
  const fiscalYear = Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Seoul" }).format(new Date()));
  const results = await Promise.all([
    finance.from("reimbursement_members").select("permissions").eq("organization_id", org).eq("active", true),
    finance.from("workflow_contract_versions").select("conditions").eq("organization_id", org).eq("status", "VERIFIED"),
    db.schema("approval").from("budgets").select("*", { count: "exact", head: true }).eq("organization_id", org).eq("fiscal_year", fiscalYear),
    finance.from("quick_expense_records").select("*", { count: "exact", head: true }).eq("organization_id", org).eq("record_status", "SOURCE_PENDING"),
    finance.from("quick_expense_records").select("*", { count: "exact", head: true }).eq("organization_id", org).eq("record_status", "EVIDENCE_PENDING"),
    finance.from("quick_expense_records").select("*", { count: "exact", head: true }).eq("organization_id", org).eq("record_status", "NEEDS_RESOLUTION"),
    finance.from("personal_reimbursements").select("*", { count: "exact", head: true }).eq("organization_id", org).eq("status", "APPROVED"),
    finance.from("advance_settlement_drafts").select("*", { count: "exact", head: true }).eq("organization_id", org).neq("status", "SETTLED"),
    finance.from("trust_operating_periods").select("*", { count: "exact", head: true }).eq("organization_id", org).neq("status", "SETTLED"),
    finance.from("workflow_transactions").select("*", { count: "exact", head: true }).eq("organization_id", org).eq("route", "UNKNOWN"),
  ]);
  const failure = results.find((result) => result.error)?.error;
  if (failure) throw new Error(`운영 준비 상태 조회 실패: ${failure.message}`);
  const [staff, contracts, budgets, card, evidence, resolution, personal, advances, periods, routes] = results;
  const permissions = new Set(((staff.data ?? []) as { permissions: string[] }[]).flatMap((row) => row.permissions));
  const missingRoles = Object.entries(roleLabels).filter(([role]) => !permissions.has(role)).map(([, label]) => label);
  const verifiedContracts = (contracts.data ?? []) as { conditions: Record<string, unknown> | null }[];
  return {
    configuration: {
      activeStaff: staff.data?.length ?? 0,
      missingRoles,
      verifiedTrustContracts: verifiedContracts.length,
      operatingFundContracts: verifiedContracts.filter((row) => row.conditions?.operating_allowed === true && row.conditions?.operating_advance_allowed === true).length,
      currentYearBudgets: budgets.count ?? 0,
    },
    queues: {
      cardLinkPending: card.count ?? 0,
      evidencePending: evidence.count ?? 0,
      resolutionRequired: resolution.count ?? 0,
      personalPaymentPending: personal.count ?? 0,
      advanceSettlementOpen: advances.count ?? 0,
      operatingPeriodOpen: periods.count ?? 0,
      routeUnclassified: routes.count ?? 0,
    },
    fiscalYear,
  };
}
