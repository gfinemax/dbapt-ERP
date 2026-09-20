import { ErpShell } from "@/components/erp-shell";
import type { ReactNode } from "react";
import {
  ExpenseEntryPage,
  type ExpenseEntryFlow,
  type ExpenseEntryMethod,
} from "@/features/finance/expense-entry-page";
import { listExpenseBudgetProfiles } from "@/features/finance/budget-profile-repository";
import { listUnresolvedCorporateCardTransactions } from "@/features/finance/corporate-card-transaction-repository";
import { listUnresolvedWithdrawalTransactions } from "@/features/finance/expense-compliance-repository";
import { listOperatingExpenseDetails } from "@/features/finance/operating-budget-repository";
import { QuickExpensePage } from "@/features/finance/quick-expense-page";
import { listQuickExpenseRecords } from "@/features/finance/quick-expense-record-repository";
import { reimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { koreaDate } from "@/features/finance/reimbursement-domain";
import { ReimbursementLogin, ReimbursementPage } from "@/features/finance/reimbursement-page";
import { loadReimbursementWorkspace } from "@/features/finance/reimbursement-repository";
import { hasSupabaseSecretConfig } from "@/lib/supabase/config";
import {
  discardUnlinkedExpenseEvidenceAction,
  getExpenseEvidenceOcrJobAction,
  retryExpenseEvidenceOcrJobAction,
} from "../expense-resolutions/actions";
import { attachQuickExpenseEvidenceAction } from "../expenses/actions";
import {
  getQuickExpensePrintEvidenceAction,
  importCorporateCardTransactionsAction,
  linkQuickExpenseCardAction,
  saveQuickExpenseRecordAction,
} from "../quick-expenses/actions";
import { reimbursementLogout } from "../reimbursements/actions";

export const dynamic = "force-dynamic";

const methods: Record<ExpenseEntryMethod, "CORPORATE_CARD" | "BANK_TRANSFER" | "AUTO_DEBIT" | "CASH"> = {
  "corporate-card": "CORPORATE_CARD",
  "bank-transfer": "BANK_TRANSFER",
  "auto-debit": "AUTO_DEBIT",
  cash: "CASH",
};

export default async function ExpenseEntryRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  let member;
  let message;
  try {
    member = await reimbursementIdentity();
  } catch (error) {
    message =
      error instanceof Error ? error.message : "사용자 정보를 불러오지 못했어.";
  }

  const staff = Boolean(member?.permissions.length);
  const requestedFlow = typeof query.flow === "string" ? query.flow : "";
  const activeFlow: ExpenseEntryFlow =
    requestedFlow === "organization" && staff
      ? "organization"
      : requestedFlow === "personal"
        ? "personal"
        : requestedFlow === "before" && staff
          ? "before"
          : requestedFlow === "advance" && staff
            ? "advance"
            : !staff && member
              ? "personal"
              : "";
  const activeMethod =
    activeFlow === "organization" && typeof query.method === "string" && query.method in methods
      ? (query.method as ExpenseEntryMethod)
      : undefined;
  let workspace: ReactNode;
  if (member && activeFlow === "personal") {
    const month = `${koreaDate().slice(0, 7)}-01`;
    let reimbursementWorkspace;
    let workspaceError = "";
    try {
      reimbursementWorkspace = await loadReimbursementWorkspace(member, month);
    } catch (error) {
      workspaceError = error instanceof Error ? error.message : "개인 정산 입력 화면을 불러오지 못했어.";
    }
    workspace = reimbursementWorkspace ? (
      <ReimbursementPage workspace={reimbursementWorkspace} initialTab="requests" initialRequestFormOpen />
    ) : (
      <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {workspaceError}
      </p>
    );
  } else if (member && staff && activeFlow === "organization" && activeMethod) {
    const [bankResult, budgetResult, cardResult, recordResult, detailResult] = await Promise.allSettled([
      listUnresolvedWithdrawalTransactions(member.organization_id),
      listExpenseBudgetProfiles(member.organization_id),
      listUnresolvedCorporateCardTransactions(member.organization_id),
      listQuickExpenseRecords(member.organization_id),
      listOperatingExpenseDetails(member.organization_id),
    ]);
    const configured = hasSupabaseSecretConfig();
    workspace = (
      <QuickExpensePage
        embedded
        initialPaymentMethod={methods[activeMethod]}
        attachEvidence={configured ? attachQuickExpenseEvidenceAction : undefined}
        discardEvidence={configured ? discardUnlinkedExpenseEvidenceAction : undefined}
        getEvidenceOcrJob={configured ? getExpenseEvidenceOcrJobAction : undefined}
        getPrintEvidence={configured ? getQuickExpensePrintEvidenceAction : undefined}
        retryEvidenceOcrJob={configured ? retryExpenseEvidenceOcrJobAction : undefined}
        importCardTransactions={configured ? importCorporateCardTransactionsAction : undefined}
        linkCardTransaction={configured ? linkQuickExpenseCardAction : undefined}
        initialBankTransactions={bankResult.status === "fulfilled" ? bankResult.value : []}
        initialBudgetItems={budgetResult.status === "fulfilled" ? Object.keys(budgetResult.value) : []}
        initialExpenseDetails={detailResult.status === "fulfilled" ? detailResult.value : []}
        initialCardTransactions={cardResult.status === "fulfilled" ? cardResult.value : []}
        initialRecords={recordResult.status === "fulfilled" ? recordResult.value : []}
        persistRecord={configured ? saveQuickExpenseRecordAction : undefined}
      />
    );
  }
  const content = member ? (
    <ExpenseEntryPage
      activeFlow={activeFlow}
      activeMethod={activeMethod}
      key={`${activeFlow}:${activeMethod ?? ""}`}
      staff={staff}
    >
      {workspace}
    </ExpenseEntryPage>
  ) : (
    <ReimbursementLogin
      error={message}
      title="지출 등록·신청"
      description="본인 계정으로 로그인하면 권한에 맞는 등록 경로를 안내해."
    />
  );

  return (
    <ErpShell
      userLabel={member?.display_name ?? "로그인 필요"}
      logoutAction={reimbursementLogout}
      activeLabel="회계/자금"
      activeWorkspaceLabel="전표·증빙관리"
      activeDetailLabel="지출 등록·신청"
    >
      <div className="mx-auto max-w-7xl">{content}</div>
    </ErpShell>
  );
}
