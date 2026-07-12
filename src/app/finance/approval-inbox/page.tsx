import { ExpenseApprovalInboxPage } from "@/features/finance/expense-approval-inbox-page";
import type { ManagedExpenseResolution } from "@/features/finance/expense-resolution-page";
import { listExpenseResolutionsFromSupabase } from "@/features/finance/expense-resolution-repository";
import { transitionExpenseApprovalAction } from "../expense-resolutions/actions";

export default async function ApprovalInboxRoute() {
  let dataLoadError: string | undefined;
  let resolutions: ManagedExpenseResolution[] = [];
  try {
    resolutions = (await listExpenseResolutionsFromSupabase()) ?? [];
  } catch (error) {
    console.warn(`[expense-approval-inbox] Supabase data unavailable: ${error instanceof Error ? error.message : String(error)}`);
    dataLoadError = "지출결의 저장소에 연결하지 못했습니다. 결재함이 최신 상태가 아닐 수 있습니다.";
  }
  return <ExpenseApprovalInboxPage dataLoadError={dataLoadError} initialResolutions={resolutions} transitionApproval={transitionExpenseApprovalAction} />;
}
