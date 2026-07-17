import { describe, expect, it } from "vitest";
import { buildApprovalDashboard } from "./approval-dashboard";
import type { ApprovalDocument } from "./approval-domain";

const document = { amount: 1000, approvalStatus: "SUBMITTED", approvalSteps: [{ approverLabel: "결재자", approverRole: "팀장", order: 1, status: "PENDING" }], body: "", createdAt: "2026-07-17", departmentLabel: "사무국", documentNo: "APR-1", documentType: "EXPENSE", drafterLabel: "기안자", executionStatus: "NOT_LINKED", id: "1", meetingStatus: "NOT_REQUIRED", purpose: "", reservedAmount: 0, title: "품의", updatedAt: "2026-07-17" } satisfies ApprovalDocument;
describe("approval dashboard", () => { it("merges roles without duplicate tasks", () => { const result = buildApprovalDashboard([document, document], "결재자", ["APPROVER", "AUDITOR"]); expect(result.cards[0].count).toBe(1); expect(result.tasks).toHaveLength(1); }); });
