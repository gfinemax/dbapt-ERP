export type BusinessPartnerType = "매출" | "매입" | "혼합";
export type BusinessPartnerBalanceType = "채권" | "채무" | "정산";

export type BusinessPartner = {
  id: string;
  code: string;
  type: BusinessPartnerType;
  ownerType: "사업자" | "개인";
  name: string;
  registrationNo: string;
  representative: string;
  businessCategory: string;
  businessItem: string;
  projectScope: string;
  phone: string;
  balanceType: BusinessPartnerBalanceType;
  balanceAmount: number;
  evidenceProfileStatus: "완료" | "미비";
};

export type RegisteredBankAccount = {
  accountName: string;
  accountNo: string;
  accountType: "신탁계좌" | "운영계좌" | "토지비계좌";
  bankName: string;
  createdAt: string;
  id: string;
  lastSyncedAt: string;
  status: "정상" | "확인필요";
  unmatchedCount: number;
  usageStatus: "사용" | "사용안함";
};

export type BankAccountInput = Pick<RegisteredBankAccount, "accountName" | "accountNo" | "accountType" | "bankName" | "createdAt">;

export type RegisteredCreditCard = {
  cardCompany: string;
  cardName: string;
  cardNo: string;
  cardType: "법인카드" | "업무대행카드";
  createdAt: string;
  id: string;
  lastSyncedAt: string;
  limitAmount: number;
  settlementBank: string;
  status: "정상" | "확인필요";
  usageStatus: "사용" | "사용안함";
};

export const businessPartnerFilters = ["전체", "매출", "매입", "혼합"];

export const basicInfoWorkflows = [
  {
    description: "세금계산서 및 채권/채무 관리를 위한 거래처 기본정보를 등록합니다.",
    title: "거래처등록",
  },
  {
    description: "전표 적요와 거래 분류에 사용할 품목 기본정보를 등록합니다.",
    title: "품목등록",
  },
  {
    description: "조합 신탁계좌, 운영계좌, 토지비 계좌 등 계좌 기본정보를 등록합니다.",
    title: "은행통장 등록",
  },
  {
    description: "법인카드, 업무대행 카드 등 카드 기본정보와 인증정보를 등록합니다.",
    title: "신용카드 등록",
  },
];

export const businessPartners: BusinessPartner[] = [
  {
    id: "bp-001",
    code: "BP-0001",
    type: "매입",
    ownerType: "사업자",
    name: "대방개발 주식회사",
    registrationNo: "123-45-67890",
    representative: "박대방",
    businessCategory: "부동산 개발",
    businessItem: "토지 매입",
    projectScope: "토지관리",
    phone: "02-1234-1000",
    balanceType: "채무",
    balanceAmount: 950000000,
    evidenceProfileStatus: "완료",
  },
  {
    id: "bp-002",
    code: "BP-0002",
    type: "혼합",
    ownerType: "사업자",
    name: "대한토지신탁",
    registrationNo: "234-56-78901",
    representative: "김신탁",
    businessCategory: "신탁업",
    businessItem: "자금관리",
    projectScope: "회계/자금",
    phone: "02-2345-2000",
    balanceType: "채무",
    balanceAmount: 277500000,
    evidenceProfileStatus: "미비",
  },
  {
    id: "bp-003",
    code: "BP-0003",
    type: "매출",
    ownerType: "사업자",
    name: "파인맥스 업무대행",
    registrationNo: "345-67-89012",
    representative: "이대행",
    businessCategory: "업무대행",
    businessItem: "조합 행정",
    projectScope: "조합원관리",
    phone: "02-3456-3000",
    balanceType: "채권",
    balanceAmount: 120000000,
    evidenceProfileStatus: "완료",
  },
];

export const registeredBankAccounts: RegisteredBankAccount[] = [
  {
    accountName: "국민은행 신탁계좌",
    accountNo: "123456-78-901234",
    accountType: "신탁계좌",
    bankName: "KB국민은행",
    createdAt: "2026-06-01",
    id: "bank-001",
    lastSyncedAt: "2026-06-06 08:10",
    status: "정상",
    unmatchedCount: 5,
    usageStatus: "사용",
  },
  {
    accountName: "국민은행 운영계좌",
    accountNo: "987654-32-100000",
    accountType: "운영계좌",
    bankName: "KB국민은행",
    createdAt: "2026-06-02",
    id: "bank-002",
    lastSyncedAt: "2026-06-06 08:08",
    status: "정상",
    unmatchedCount: 3,
    usageStatus: "사용",
  },
];

export const registeredCreditCards: RegisteredCreditCard[] = [
  {
    cardCompany: "KB국민카드",
    cardName: "법인카드",
    cardNo: "****-****-****-5521",
    cardType: "법인카드",
    createdAt: "2026-06-03",
    id: "card-001",
    lastSyncedAt: "2026-06-05 18:30",
    limitAmount: 30000000,
    settlementBank: "KB국민은행 운영계좌",
    status: "확인필요",
    usageStatus: "사용",
  },
  {
    cardCompany: "신한카드",
    cardName: "업무대행 카드",
    cardNo: "****-****-****-9010",
    cardType: "업무대행카드",
    createdAt: "2026-06-04",
    id: "card-002",
    lastSyncedAt: "2026-06-05 17:45",
    limitAmount: 15000000,
    settlementBank: "국민은행 운영계좌",
    status: "정상",
    usageStatus: "사용",
  },
];

export function formatKrw(amount: number) {
  return `${new Intl.NumberFormat("ko-KR").format(amount)}원`;
}

export function getBusinessPartnerSummary() {
  return {
    totalPartners: businessPartners.length,
    receivablePartners: businessPartners.filter((partner) => partner.balanceType === "채권").length,
    payablePartners: businessPartners.filter((partner) => partner.balanceType === "채무").length,
    missingEvidenceProfiles: businessPartners.filter((partner) => partner.evidenceProfileStatus === "미비").length,
  };
}
