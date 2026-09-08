import { ErpShell } from "@/components/erp-shell";
import { expenseDb, requireExpenseActor } from "@/features/finance/expense-authorization";
import { listExpenseResolutionsFromSupabase } from "@/features/finance/expense-resolution-repository";
import { ExpenseAuthorizationPage } from "@/features/finance/expense-authorization-page";
import { ReimbursementLogin } from "@/features/finance/reimbursement-page";

export const dynamic = "force-dynamic";
export default async function Page() {
  let actor;
  try { actor = await requireExpenseActor("ADMIN"); }
  catch (error) { return <ReimbursementLogin title="작성자·결재선 계정 연결" description="관리자 계정으로 로그인해줘." error={error instanceof Error ? error.message : "권한 확인이 필요합니다."} />; }
  let records: Awaited<ReturnType<typeof listExpenseResolutionsFromSupabase>> = [];
  let members: { user_id: string; display_name: string; permissions: string[] }[] = [];
  let message = "";
  try {
    records = await listExpenseResolutionsFromSupabase() ?? [];
    const { data, error } = await expenseDb().schema("finance").from("reimbursement_members")
      .select("user_id,display_name,permissions").eq("organization_id", actor.organization_id).eq("active", true).order("display_name");
    if (error) throw new Error("같은 조합의 사용자 목록을 불러오지 못했습니다.");
    members = data ?? [];
  } catch (error) { message = error instanceof Error ? error.message : "자료를 불러오지 못했습니다."; }
  const content = message ? <p role="alert">{message}</p> : <ExpenseAuthorizationPage records={records ?? []} members={members} />;
  return <ErpShell activeLabel="회계/자금" activeWorkspaceLabel="전표·증빙관리" activeDetailLabel="지출·신탁 설정" userLabel={actor.display_name}><div className="mx-auto max-w-5xl p-5">{content}</div></ErpShell>;
}
