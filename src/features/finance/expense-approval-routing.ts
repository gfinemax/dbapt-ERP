import { organizationApprovalLine } from "@/features/approval/organization-approval-line";

export type ExpenseApprovalRoute = "SECRETARY_CHAIR" | "DIRECTOR_DELEGATED" | "DIRECTOR_FULL";

export type ExpenseApprovalParticipantAction =
  | "작성"
  | "규정상 생략"
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

export const expenseApprovalRouteOptions: ReadonlyArray<{
  description: string;
  label: string;
  route: ExpenseApprovalRoute;
}> = [
  {
    description: "장현제는 규정상 생략으로 표시하고 안동연이 최종 결재해.",
    label: "오학동 작성 · 안동연 결재",
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

export function buildExpenseApprovalRoute(route: ExpenseApprovalRoute) {
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
    approvalLine: [step(chair, 1, "최종결재")],
    participants: [
      participant(director, "규정상 생략"),
      participant(secretaryGeneral, "작성"),
      participant(chair, "최종결재", 1),
    ],
  };
}

export function inferExpenseApprovalRoute(approvers: Array<{ approver: string }>): ExpenseApprovalRoute {
  const names = approvers.map((step) => step.approver);
  if (names.length === 1 && names[0] === secretaryGeneral.approverLabel) return "DIRECTOR_DELEGATED";
  if (names.length === 2 && names[0] === secretaryGeneral.approverLabel && names[1] === chair.approverLabel) return "DIRECTOR_FULL";
  return "SECRETARY_CHAIR";
}

export function getExpenseApprovalRouteLabel(route: ExpenseApprovalRoute) {
  return expenseApprovalRouteOptions.find((option) => option.route === route)?.label ?? expenseApprovalRouteOptions[0].label;
}
