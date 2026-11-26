import { buildExpenseApprovalRoute, inferExpenseApprovalRoute } from "./expense-approval-routing";
import { approvalPolicyVersion, canApproveOn, canAuthorOn, createExpenseApprovalPolicy, directorAppointment, isDirector, isIsoDay, seoulToday, type ExpenseApprovalPolicy } from "@/features/approval/approval-effective-policy";
import type { ManagedExpenseResolution } from "./expense-resolution-page";

export function expenseApprovalPeriodIssues(resolution: Pick<ManagedExpenseResolution, "author" | "approvalLine" | "approvalParticipants" | "approvalPolicy">, requireCurrentDay = false, today = seoulToday()) {
  const policy = resolution.approvalPolicy;
  const hasDirector = isDirector(resolution.author ?? "") || resolution.approvalLine.some(step => isDirector(step.approver)) || resolution.approvalParticipants?.some(person => isDirector(person.name));
  if (!policy) return hasDirector ? ["장현제 이사가 포함된 문서의 결재 기준일을 먼저 확인해주세요. 관리자 결재선 기간 정리에서 확인할 수 있습니다."] : [];
  const issues: string[] = [];
  if (!isIsoDay(policy.referenceDate) || policy.referenceDate > today || policy.version !== approvalPolicyVersion || policy.directorHiredOn !== directorAppointment.hiredOn || policy.directorApprovalFrom !== directorAppointment.approvalFrom || !["CURRENT", "HISTORICAL"].includes(policy.kind)) return ["저장된 결재 기준일 또는 규칙 버전을 확인해주세요."];
  if (policy.kind === "HISTORICAL" && !policy.originalReference?.trim()) issues.push("원문 결재일 확인 근거가 필요합니다.");
  if (requireCurrentDay && policy.kind === "CURRENT" && policy.referenceDate !== today) issues.push("상신일이 변경되었습니다. 초안을 다시 저장하여 오늘 기준 결재선을 확인해주세요.");
  if (!canAuthorOn(resolution.author ?? "", policy.referenceDate)) issues.push("장현제 이사 입사일(2026-06-22) 이전 문서의 작성자를 원문과 대조해주세요.");
  if (resolution.approvalLine.some(step => !canApproveOn(step.approver, policy.referenceDate))) issues.push("2026-07-01 이전에는 장현제 이사를 실제 결재선에 포함할 수 없습니다.");
  for (const person of resolution.approvalParticipants ?? []) {
    if (person.action === "작성" ? !canAuthorOn(person.name, policy.referenceDate) : !canApproveOn(person.name, policy.referenceDate)) {
      issues.push("기준일에 권한이 없는 참여자가 표시되어 있습니다. 작성·생략·검토·전결 표시를 함께 정리해주세요."); break;
    }
  }
  return issues;
}
export function assertExpenseApprovalPeriod(resolution: Parameters<typeof expenseApprovalPeriodIssues>[0], requireCurrentDay = false, today = seoulToday()) {
  const issues = expenseApprovalPeriodIssues(resolution, requireCurrentDay, today);
  if (issues.length) throw new Error(issues.join(" "));
}
export function approvalRepairBlockReason(record: ManagedExpenseResolution) {
  if (!["작성중", "반려", "승인대기"].includes(record.approvalStatus)) return "승인 완료 문서는 원본을 보존하고 별도 정정 문서로 처리해주세요.";
  if ((record.paymentStatus && record.paymentStatus !== "지급전") || record.voucherNo || record.voucherGenerated || record.voucherStatus || record.approvedAt || (record.actualPaidAmount ?? 0) > 0 || record.paidAt || record.disbursedAt) return "지급·전표 이력이 있는 문서는 자동 변경하지 않습니다.";
  if (record.approvalLine.some(step => step.status === "승인완료") || record.history?.some(item => (item.actionType === "APPROVED" || ["승인", "결재승인", "최종승인"].includes(item.actionLabel)))) return "이미 처리된 승인 이력을 보존해야 합니다. 별도 정정 절차를 진행해주세요.";
  return "";
}
export function previewExpenseApprovalRepair(record: ManagedExpenseResolution, referenceDate: string, reason: string, today = seoulToday()) {
  const policy = createExpenseApprovalPolicy("HISTORICAL", referenceDate, today, reason);
  const blocked = approvalRepairBlockReason(record);
  const approvalLine = record.approvalLine.filter(step => canApproveOn(step.approver, policy.referenceDate)).map((step, index) => ({ ...step, order: index + 1, status: "대기" as const, processedAt: undefined }));
  const participants = record.approvalParticipants?.filter(person => person.action === "작성" ? canAuthorOn(person.name, policy.referenceDate) : canApproveOn(person.name, policy.referenceDate)).map(person => ({
    ...person, approvalOrder: person.approvalOrder ? approvalLine.find(step => step.approver === person.name)?.order : undefined,
  }));
  const after: ManagedExpenseResolution = { ...record, approvalLine, approvalParticipants: participants, approvalPolicy: policy, approvalStatus: record.approvalStatus === "승인대기" ? "작성중" : record.approvalStatus, currentApprover: undefined };
  const issues = [...(blocked ? [blocked] : []), ...expenseApprovalPeriodIssues(after, false, today)];
  if (record.approvalParticipants?.some(person => person.action === "작성" && !canAuthorOn(person.name, policy.referenceDate))) issues.push("입사 전 작성자 표시를 원문과 대조해주세요. 작성자는 자동 변경하지 않습니다.");
  if (!approvalLine.length) issues.push("실제 결재자가 한 명 이상 필요합니다. 자동 승인으로 변경할 수 없습니다.");
  const bindingSteps = approvalLine.flatMap(step => {
    const matches = record.authorization?.steps.filter(binding => binding.legacy_step.approver === step.approver && binding.legacy_step.role === step.role) ?? [];
    return matches.length === 1 ? [{ ...matches[0], order: step.order, legacy_step: { approver: step.approver, role: step.role, order: step.order } }] : [];
  });
  return { before: record, after, policy, issues, canApply: issues.length === 0, bindingSteps };
}
export function policySummary(policy?: ExpenseApprovalPolicy) {
  if (!policy || !isIsoDay(policy.referenceDate)) return "원문 결재일 확인 필요";
  return (policy.kind === "HISTORICAL" ? "과거 원문 기준 " : "상신일 기준 ") + policy.referenceDate;
}

export function canShowExpenseApprovalParticipant(name: string, referenceDate?: string) {
  return !referenceDate || !isIsoDay(referenceDate) || canApproveOn(name, referenceDate);
}

export function prepareExpenseApprovalDraft(record: ManagedExpenseResolution, existing: ManagedExpenseResolution | null, isAdmin: boolean, today = seoulToday()) {
  const input = record.approvalPolicy;
  const kind = input?.kind ?? "CURRENT";
  if ((kind === "HISTORICAL" || existing?.approvalPolicy?.kind === "HISTORICAL") && !isAdmin && (kind !== existing?.approvalPolicy?.kind || existing?.approvalPolicy?.referenceDate !== input?.referenceDate || existing?.approvalPolicy?.originalReference !== input?.originalReference)) throw new Error("과거 원문 기준일 등록·변경은 관리자만 할 수 있습니다.");
  const approvalPolicy = createExpenseApprovalPolicy(kind, input?.referenceDate, today, input?.originalReference);
  const route = record.approvalRoute ?? inferExpenseApprovalRoute(record.approvalLine);
  const routed = buildExpenseApprovalRoute(route, approvalPolicy.referenceDate);
  if (routed.error) throw new Error(routed.error);
  const next = { ...record, approvalPolicy, approvalRoute: route, approvalLine: routed.approvalLine, approvalParticipants: routed.participants };
  assertExpenseApprovalPeriod(next, false, today);
  return next;
}

export function assertExpenseActorPeriod(actorName: string, policy: ExpenseApprovalPolicy | undefined, command: "REQUEST" | "APPROVE" | "REJECT") {
  if (!isDirector(actorName)) return;
  if (!policy) throw new Error("장현제 계정의 처리 권한을 확인할 결재 기준일이 필요합니다.");
  if (command !== "REQUEST" ? !canApproveOn(actorName, policy.referenceDate) : !canAuthorOn(actorName, policy.referenceDate)) throw new Error(command !== "REQUEST" ? "장현제 이사는 2026-07-01 이전 기준 문서를 결재할 수 없습니다." : "장현제 이사 입사일 이전 기준의 작성자 계정을 확인해주세요.");
}
