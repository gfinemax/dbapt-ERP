import { ErpShell } from "@/components/erp-shell";
import { ExpenseEntryPage } from "@/features/finance/expense-entry-page";
import { reimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { ReimbursementLogin } from "@/features/finance/reimbursement-page";
import { reimbursementLogout } from "../reimbursements/actions";

export const dynamic = "force-dynamic";

export default async function ExpenseEntryRoute() {
  let member;
  let message;
  try {
    member = await reimbursementIdentity();
  } catch (error) {
    message =
      error instanceof Error ? error.message : "사용자 정보를 불러오지 못했어.";
  }

  const staff = Boolean(member?.permissions.length);
  const content = member ? (
    <ExpenseEntryPage staff={staff} />
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
