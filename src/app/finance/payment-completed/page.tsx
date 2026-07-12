import { ExpensePaymentWorkflowPage } from "@/features/finance/expense-payment-workflow-page";
import { listExpenseResolutionsFromSupabase } from "@/features/finance/expense-resolution-repository";
import { transitionExpenseDisbursementAction } from "../expense-resolutions/actions";

export default async function PaymentCompletedRoute() {
  let dataLoadError: string | undefined;
  let initialResolutions;
  try {
    initialResolutions = (await listExpenseResolutionsFromSupabase()) ?? [];
  } catch {
    dataLoadError = "지출결의 저장소에 연결하지 못했습니다.";
  }
  return <ExpensePaymentWorkflowPage dataLoadError={dataLoadError} initialMode="completed" initialResolutions={initialResolutions} transitionDisbursement={transitionExpenseDisbursementAction} />;
}
