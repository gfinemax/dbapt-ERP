import { smallExpenseDb } from "./small-expense-repository";
import type { ReimbursementMember } from "@/features/finance/reimbursement-domain";
import type { InboxTask } from "./unified-inbox-model";

// Include pending items from every month and open the actual source month.
export async function loadSmallExpenseInbox(member: ReimbursementMember): Promise<InboxTask[]> {
  const db = smallExpenseDb();
  const { data: roles, error } = await db.schema("approval").from("small_expense_roles")
    .select("chair_id").eq("organization_id", member.organization_id).maybeSingle();
  if (error) throw new Error("소액지출 담당자 정보를 불러오지 못했어.");
  if (!member.active || roles?.chair_id !== member.user_id) return [];
  const tasks: InboxTask[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await db.schema("approval").from("small_expenses")
      .select("id,description,amount,expense_date", { count: "exact" })
      .eq("organization_id", member.organization_id).eq("review_status", "PENDING")
      .is("deleted_at", null).is("batch_resolution_id", null)
      .neq("registered_by", member.user_id).neq("spender_id", member.user_id)
      .order("expense_date").order("id").range(offset, offset + 499);
    if (result.error) throw new Error("소액지출 확인대기를 불러오지 못했어.");
    for (const row of result.data ?? []) tasks.push({ key: `small:${row.id}`, kind: "small", title: row.description,
      label: `소액지출 확인 · ${row.expense_date}`, amount: Number(row.amount),
      href: `/approval/inbox?${new URLSearchParams({ type: "small", month: row.expense_date.slice(0, 7) })}#small-${row.id}` });
    if (tasks.length >= (result.count ?? 0)) break;
    if ((result.data?.length ?? 0) !== 500) throw new Error("소액지출 조회 한도를 확인해줘. 전체 대기를 표시하지 못했어.");
  }
  return tasks;
}
