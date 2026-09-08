import { requireReimbursementIdentity } from "./reimbursement-auth";
import { loadExpenseWorkspace } from "./expense-workspace-repository";
import { loadPaymentWorkspace } from "./fund-payment-repository";
import { loadFundTrust } from "./fund-trust-repository";
import { loadAccountingWorkspace } from "./accounting-workspace-repository";
import { loadFinanceTaskSources } from "./finance-task-sources-repository";

import { financeTasks, type FinanceTaskKind, type FinanceTaskWorkspace, type FinanceTaskInputs } from "./finance-workspace-domain";

export async function loadFinanceTaskWorkspace(): Promise<FinanceTaskWorkspace> {
  const member = await requireReimbursementIdentity();
  if (!member.active) throw new Error("활성 조직 권한이 필요합니다.");
  const staff = member.permissions.some(p => ["ADMIN", "APPROVE", "PAY", "CLOSE", "SENIOR"].includes(p));
  const sections = [
    { key: "sourceTasks" as const, kinds: (staff ? ["MY_APPROVAL", "TRUST_READY", "SETTLEMENT_OVERDUE", "EVIDENCE_REVIEW", "BANK_UNMATCHED"] : ["MY_APPROVAL"]) as FinanceTaskKind[], load: loadFinanceTaskSources },
    { key: "expenses" as const, kinds: ["UNCONNECTED", "APPROVAL"] as FinanceTaskKind[], load: loadExpenseWorkspace },
    ...(staff ? [
      { key: "payments" as const, kinds: ["PAYABLE", "PAYMENT_REVIEW"] as FinanceTaskKind[], load: loadPaymentWorkspace },
      { key: "trust" as const, kinds: ["TRUST_SUPPLEMENT"] as FinanceTaskKind[], load: loadFundTrust },
      { key: "accounting" as const, kinds: ["ACCOUNTING_REVIEW"] as FinanceTaskKind[], load: loadAccountingWorkspace },
    ] : []),
  ];
  const results = await Promise.allSettled(sections.map(section => section.load()));
  const input: FinanceTaskInputs = {}; const unavailable: FinanceTaskWorkspace["unavailable"] = []; let sourceTasks: FinanceTaskWorkspace["tasks"] = [];
  results.forEach((result, index) => {
    const section = sections[index];
    if (result.status === "fulfilled") {
      if (section.key === "sourceTasks") sourceTasks = result.value as FinanceTaskWorkspace["tasks"];
      else Object.assign(input, { [section.key]: result.value });
    }
    else for (const kind of section.kinds) unavailable.push({ kind, message: "자료를 불러오지 못했어. 새로고침해서 다시 확인해줘." });
  });
  return { tasks: [...sourceTasks, ...financeTasks(input)], unavailable, staff };
}
