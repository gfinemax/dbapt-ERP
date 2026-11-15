export const directorAppointment = {
  personKey: "jang-hyeon-je", name: "장현제", title: "이사",
  hiredOn: "2026-06-22", approvalFrom: "2026-07-01",
} as const;
export const approvalPolicyVersion = "organization-approval-2026-07-v1";
export type ApprovalRecordKind = "CURRENT" | "HISTORICAL";
export type ExpenseApprovalPolicy = {
  kind: ApprovalRecordKind; referenceDate: string; version: string;
  directorHiredOn: string; directorApprovalFrom: string; originalReference?: string;
};
export function seoulToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function isIsoDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
}
export function isDirector(name: string) { return /^장현제(?:\s|$)/.test(name.trim()); }
export function canAuthorOn(name: string, day: string) { return !isDirector(name) || day >= directorAppointment.hiredOn; }
export function canApproveOn(name: string, day: string) { return !isDirector(name) || day >= directorAppointment.approvalFrom; }
export function createExpenseApprovalPolicy(kind: ApprovalRecordKind = "CURRENT", originalDate = "", today = seoulToday(), originalReference = ""): ExpenseApprovalPolicy {
  if (kind !== "CURRENT" && kind !== "HISTORICAL") throw new Error("결재 기준 구분을 확인해주세요.");
  const referenceDate = kind === "CURRENT" ? today : originalDate;
  if (!isIsoDay(referenceDate) || referenceDate > today) throw new Error("과거 문서의 원문 결재 기준일을 확인해주세요. 미래 날짜는 사용할 수 없습니다.");
  if (kind === "HISTORICAL" && !originalReference.trim()) throw new Error("원문 결재일 확인 근거를 입력해주세요.");
  return { kind, referenceDate, version: approvalPolicyVersion, directorHiredOn: directorAppointment.hiredOn, directorApprovalFrom: directorAppointment.approvalFrom, ...(kind === "HISTORICAL" ? { originalReference: originalReference.trim() } : {}) };
}
