export type MemberStatus = "정상" | "검토중" | "탈퇴/승계";
export type PaymentStatus = "완료" | "미납" | "연체";
export type DocumentStatus = "완료" | "미비" | "검토";
export type IntegrationStatus = "정상" | "충돌";

export type Member = {
  id: string;
  memberNo: string;
  name: string;
  phone: string;
  unit: string;
  address: string;
  status: MemberStatus;
  contractStatus: "정상" | "검토";
  paymentStatus: PaymentStatus;
  documentStatus: DocumentStatus;
  integrationStatus: IntegrationStatus;
  joinedAt: string;
  recentPayment: {
    label: string;
    amount: string;
    paidAt: string;
  };
  recentDocument: {
    label: string;
    status: string;
  };
  memo: string;
};

export const memberFilters = ["전체", "정상", "검토중", "미납", "서류미비", "탈퇴/승계"];

export const members: Member[] = [
  {
    id: "m-000124",
    memberNo: "M-000124",
    name: "김민준",
    phone: "010-2401-1024",
    unit: "101동 1201호",
    address: "서울 동작구 대방동",
    status: "정상",
    contractStatus: "정상",
    paymentStatus: "완료",
    documentStatus: "완료",
    integrationStatus: "정상",
    joinedAt: "2025-11-12",
    recentPayment: {
      label: "계약금",
      amount: "35,000,000원",
      paidAt: "2026-05-20",
    },
    recentDocument: {
      label: "조합가입계약서",
      status: "확인완료",
    },
    memo: "계약 및 납부 상태가 안정적인 기준 조합원입니다.",
  },
  {
    id: "m-000125",
    memberNo: "M-000125",
    name: "박서연",
    phone: "010-7742-1930",
    unit: "102동 304호",
    address: "서울 영등포구 신길동",
    status: "정상",
    contractStatus: "정상",
    paymentStatus: "미납",
    documentStatus: "미비",
    integrationStatus: "정상",
    joinedAt: "2025-12-03",
    recentPayment: {
      label: "중도금 1차",
      amount: "18,000,000원",
      paidAt: "미납",
    },
    recentDocument: {
      label: "인감증명서",
      status: "보완요청",
    },
    memo: "미납 안내와 서류 보완 요청이 동시에 필요합니다.",
  },
  {
    id: "m-000126",
    memberNo: "M-000126",
    name: "이정호",
    phone: "010-9182-4405",
    unit: "배정전",
    address: "서울 관악구 봉천동",
    status: "검토중",
    contractStatus: "검토",
    paymentStatus: "완료",
    documentStatus: "검토",
    integrationStatus: "충돌",
    joinedAt: "2026-01-18",
    recentPayment: {
      label: "계약금",
      amount: "35,000,000원",
      paidAt: "2026-01-22",
    },
    recentDocument: {
      label: "권리승계 확인서",
      status: "검토중",
    },
    memo: "peopleON 원장과 ERP 임시 원장의 세대 정보 매핑 확인이 필요합니다.",
  },
];

export function findMemberById(id: string) {
  return members.find((member) => member.id === id);
}
