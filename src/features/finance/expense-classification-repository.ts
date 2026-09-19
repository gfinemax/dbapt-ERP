import { requireReimbursementIdentity } from "./reimbursement-auth";
import { reimbursementDb } from "./reimbursement-repository";
import { hasReimbursementPermission } from "./reimbursement-domain";
import { validateClassification, type ExpenseClassification, type ExpenseClassificationContext, type ExpenseClassificationInput } from "./expense-classification";

async function classificationActor() {
  const actor = await requireReimbursementIdentity();
  if (!actor.active || !hasReimbursementPermission(actor, "APPROVE")) throw new Error("지출 분류 확인 권한이 필요해.");
  return actor;
}
export async function loadExpenseClassification(transactionId: string): Promise<ExpenseClassificationContext> {
  const actor = await classificationActor();
  const db = reimbursementDb().schema("finance");
  const { data: tx, error } = await db.from("workflow_transactions").select("id,source_kind,source_signature").eq("organization_id", actor.organization_id).eq("id", transactionId).maybeSingle();
  if (error || !tx || !["RESOLUTION", "QUICK", "PERSONAL"].includes(tx.source_kind)) throw new Error("조회 가능한 지출 원본을 찾을 수 없어.");
  const [classification, advances] = await Promise.all([
    db.from("expense_classifications").select("transaction_id,cost_category,payment_method,funding_origin,processing_route,budget_state,advance_transaction_id,source_signature,version,reason").eq("organization_id", actor.organization_id).eq("transaction_id", transactionId).maybeSingle(),
    db.rpc("advance_settlement_workspace", { p_org: actor.organization_id, p_actor: actor.user_id }),
  ]);
  if (classification.error || advances.error) throw new Error("지출 분류 정보를 불러오지 못했어. 다시 시도해줘.");
  if (!Array.isArray(advances.data?.candidates)) throw new Error("선지급 조회 결과를 확인하지 못했어.");
  return { transactionId, sourceSignature: tx.source_signature, classification: classification.data as ExpenseClassification | null,
    advances: advances.data.candidates.filter((item: { legacy_review_required: boolean; transaction_id: string }) => !item.legacy_review_required && item.transaction_id !== transactionId)
      .map((item: { transaction_id: string; number: string; title: string }) => ({ id: item.transaction_id, title: `${item.number} · ${item.title}` })) };
}
export async function saveExpenseClassification(input: ExpenseClassificationInput, operationKey: string): Promise<ExpenseClassification> {
  const actor = await classificationActor();
  const errors = validateClassification(input);
  if (errors.length) throw new Error(errors.join(" "));
  const { data, error } = await reimbursementDb().schema("finance").rpc("expense_classification_save", {
    p_org: actor.organization_id, p_actor: actor.user_id, p_data: input, p_key: operationKey,
  });
  if (error) throw new Error(error.message);
  if (!data || data.transaction_id !== input.transaction_id || !Number.isSafeInteger(data.version)) throw new Error("저장 결과를 확인하지 못했어. 같은 처리로 다시 확인해줘.");
  return data as ExpenseClassification;
}
