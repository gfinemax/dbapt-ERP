import { canApproveOn, canAuthorOn, directorAppointment, isIsoDay, seoulToday, type ExpenseApprovalPolicy } from "@/features/approval/approval-effective-policy";
import { organizationApprovalLine } from "@/features/approval/organization-approval-line";

export type ExpenseApprovalRoute = "SECRETARY_CHAIR" | "DIRECTOR_DELEGATED" | "DIRECTOR_FULL";

export type ExpenseApprovalParticipantAction =
  | "작성"
  | "규정상 생략"
  | "회계검토"
  | "검토"
  | "전결"
  | "최종결재"
  | "후열·보고";

export type ExpenseApprovalParticipant = {
  action: ExpenseApprovalParticipantAction;
  approvalOrder?: number;
  name: string;
  title: string;
};

export type RoutedApprovalStep = {
  approver: string;
  order: number;
  role: string;
  status: "대기";
};

type ExpenseApprovalRouteSnapshot = {
  author?: string;
  approvalLine: Array<Pick<RoutedApprovalStep, "approver" | "order" | "role">>;
  approvalParticipants?: ExpenseApprovalParticipant[];
  approvalPolicy?: Pick<ExpenseApprovalPolicy, "kind" | "referenceDate">;
  approvalRoute?: ExpenseApprovalRoute;
};

export const expenseApprovalRouteOptions: ReadonlyArray<{
  description: string;
  label: string;
  route: ExpenseApprovalRoute;
}> = [
  {
    description: "장현제가 회계 내용을 검토하고 안동연이 최종 결재해.",
    label: "오학동 작성 · 장현제 회계검토 · 안동연 결재",
    route: "SECRETARY_CHAIR",
  },
  {
    description: "오학동이 전결하고 안동연은 후열·보고 대상으로 표시해.",
    label: "장현제 작성 · 오학동 전결",
    route: "DIRECTOR_DELEGATED",
  },
  {
    description: "오학동 검토 후 안동연이 최종 결재해.",
    label: "장현제 작성 · 오학동 검토 · 안동연 결재",
    route: "DIRECTOR_FULL",
  },
];

const [director, secretaryGeneral, chair] = organizationApprovalLine;

function participant(
  person: (typeof organizationApprovalLine)[number],
  action: ExpenseApprovalParticipantAction,
  approvalOrder?: number,
): ExpenseApprovalParticipant {
  return {
    action,
    approvalOrder,
    name: person.approverLabel,
    title: person.approverRole,
  };
}

function step(person: (typeof organizationApprovalLine)[number], order: number, role: string): RoutedApprovalStep {
  return {
    approver: person.approverLabel,
    order,
    role,
    status: "대기",
  };
}

function buildUndatedExpenseApprovalRoute(route: ExpenseApprovalRoute) {
  if (route === "DIRECTOR_DELEGATED") {
    return {
      approvalLine: [step(secretaryGeneral, 1, "전결")],
      participants: [
        participant(director, "작성"),
        participant(secretaryGeneral, "전결", 1),
        participant(chair, "후열·보고"),
      ],
    };
  }

  if (route === "DIRECTOR_FULL") {
    return {
      approvalLine: [step(secretaryGeneral, 1, "검토"), step(chair, 2, "최종결재")],
      participants: [
        participant(director, "작성"),
        participant(secretaryGeneral, "검토", 1),
        participant(chair, "최종결재", 2),
      ],
    };
  }

  return {
    approvalLine: [step(director, 1, "회계검토"), step(chair, 2, "최종결재")],
    participants: [
      participant(director, "회계검토", 1),
      participant(secretaryGeneral, "작성"),
      participant(chair, "최종결재", 2),
    ],
  };
}

function isSecretaryAuthor(author?: string) {
  return author?.trim().split(/\s+/)[0] === secretaryGeneral.approverLabel;
}

export function inferExpenseApprovalRoute(approvers: Array<{ approver: string }>, author?: string): ExpenseApprovalRoute {
  if (isSecretaryAuthor(author)) return "SECRETARY_CHAIR";
  const names = approvers.map((step) => step.approver);
  if (names.length === 1 && names[0] === secretaryGeneral.approverLabel) return "DIRECTOR_DELEGATED";
  if (names.length === 2 && names[0] === secretaryGeneral.approverLabel && names[1] === chair.approverLabel) return "DIRECTOR_FULL";
  return "SECRETARY_CHAIR";
}

export function getExpenseApprovalRouteLabel(route: ExpenseApprovalRoute) {
  return expenseApprovalRouteOptions.find((option) => option.route === route)?.label ?? expenseApprovalRouteOptions[0].label;
}

export function buildExpenseApprovalRoute(route: ExpenseApprovalRoute, referenceDate = seoulToday()) {
  const result = buildUndatedExpenseApprovalRoute(route);
  const error = route !== "SECRETARY_CHAIR" && !canAuthorOn(directorAppointment.name, referenceDate) ? "장현제 입사일(2026-06-22) 이전에는 장현제 작성 경로를 선택할 수 없습니다." : "";
  const approvalLine = result.approvalLine.filter(step => canApproveOn(step.approver, referenceDate)).map((step, index) => ({ ...step, order: index + 1 }));
  return {
    approvalLine,
    participants: result.participants
      .filter(person => person.action === "작성" ? canAuthorOn(person.name, referenceDate) : canApproveOn(person.name, referenceDate))
      .map(person => ({ ...person, approvalOrder: person.approvalOrder === undefined ? undefined : approvalLine.find(step => step.approver === person.name)?.order })),
    error,
    referenceDate,
  };
}

function getExpectedExpenseApprovalRoute(resolution: ExpenseApprovalRouteSnapshot, today: string) {
  const route = resolution.approvalRoute ?? inferExpenseApprovalRoute(resolution.approvalLine, resolution.author);
  const referenceDate = resolution.approvalPolicy?.kind === "HISTORICAL" ? resolution.approvalPolicy.referenceDate : today;
  return buildExpenseApprovalRoute(route, referenceDate);
}

export function getDraftExpenseApprovalRoute(resolution: ExpenseApprovalRouteSnapshot & { approvalStatus: string }, today = seoulToday()) {
  if (!["작성중", "반려"].includes(resolution.approvalStatus) || (!resolution.approvalRoute && !isSecretaryAuthor(resolution.author))) return;
  const expected = getExpectedExpenseApprovalRoute(resolution, today);
  if (isIsoDay(expected.referenceDate) && expected.referenceDate <= today) return expected;
}

export const expenseApprovalRouteRefreshMessage = "현재 결재 기준일에 맞게 초안을 다시 저장하고 결재자 계정 연결을 확인해 주세요.";

export function hasExpenseApprovalRouteDrift(resolution: ExpenseApprovalRouteSnapshot, today = seoulToday()) {
  if (!resolution.approvalRoute && !isSecretaryAuthor(resolution.author)) return false;
  const expected = getExpectedExpenseApprovalRoute(resolution, today);
  if (expected.referenceDate !== resolution.approvalPolicy?.referenceDate) return true;
  const stepsMatch = resolution.approvalLine.length === expected.approvalLine.length
    && resolution.approvalLine.every((step, index) => {
      const expectedStep = expected.approvalLine[index];
      return step.approver === expectedStep.approver
        && step.order === expectedStep.order
        && step.role === expectedStep.role;
    });
  const currentParticipants = resolution.approvalParticipants ?? [];
  const participantsMatch = currentParticipants.length === expected.participants.length
    && currentParticipants.every((person, index) => {
      const expectedPerson = expected.participants[index];
      return person.action === expectedPerson.action
        && person.approvalOrder === expectedPerson.approvalOrder
        && person.name === expectedPerson.name
        && person.title === expectedPerson.title;
    });
  return Boolean(expected.error) || !stepsMatch || !participantsMatch;
}
