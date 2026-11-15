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
  address?: string;
  firstTransactionDate?: string;
  registrationSource?: "직접등록" | "OCR 자동등록";
  sourceEvidenceId?: string;
  sourceResolutionNo?: string;
};

export type BusinessPartnerOcrInput = {
  address?: string;
  businessCategory?: string;
  businessItem?: string;
  evidenceId: string;
  firstTransactionDate?: string;
  name: string;
  phone?: string;
  registrationNo: string;
  representative?: string;
  resolutionNo: string;
};

export type BusinessPartnerRegistrationResult = {
  partner: BusinessPartner;
  status: "CREATED" | "EXISTING";
};

export type BusinessPartnerInput = Pick<
  BusinessPartner,
  "address" | "balanceType" | "businessCategory" | "businessItem" | "name" | "ownerType" | "phone" | "projectScope" | "registrationNo" | "representative" | "type"
>;

export type RegisteredItem = {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  description: string;
  usageStatus: "사용" | "사용안함";
};

export type ItemInput = Pick<RegisteredItem, "category" | "code" | "description" | "name" | "unit">;

export type RegisteredBankAccount = {
  accountPurpose?: string;
  accountName: string;
  accountNo: string;
  accountType: "신탁계좌" | "운영계좌" | "토지비계좌";
  bankName: string;
  closedAt?: string;
  createdAt: string;
  currentBalance?: number | null;
  id: string;
  lastSyncedAt: string;
  status: "정상" | "확인필요";
  unmatchedCount: number;
  usageStatus: "사용" | "사용안함";
  verifiedAt?: string;
};

export type BankAccountInput = Pick<
  RegisteredBankAccount,
  "accountName" | "accountNo" | "accountPurpose" | "accountType" | "bankName" | "closedAt" | "createdAt" | "currentBalance" | "verifiedAt"
>;

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

export type CreditCardInput = Pick<RegisteredCreditCard, "cardCompany" | "cardName" | "cardNo" | "cardType" | "createdAt">;

export const businessPartnerFilters = ["전체", "매출", "매입", "혼합"];

export const basicInfoWorkflows = [
  {
    description: "세금계산서 및 채권/채무 관리를 위한 거래처 기본정보를 등록합니다.",
    title: "거래처 관리",
  },
  {
    description: "전표 적요와 거래 분류에 사용할 품목 기본정보를 등록합니다.",
    title: "품목 관리",
  },
  {
    description: "조합 신탁계좌, 운영계좌, 토지비 계좌 등 계좌 기본정보를 등록합니다.",
    title: "은행계좌 관리",
  },
  {
    description: "법인카드, 업무대행 카드 등 카드 기본정보와 인증정보를 등록합니다.",
    title: "법인카드 관리",
  },
  {
    description: "운영비 예산안과 수지분석표 기준 계정과목을 등록합니다.",
    title: "계정과목 관리",
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
    name: "오학동 업무대행",
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
  bankAccount("bank-daebang-001", "안동연(대방동지주택)", "우리은행", "1006-901-293047", "운영계좌", "2008-07-09", { accountPurpose: "조합 운영비", currentBalance: 1479, verifiedAt: "2026-08-25" }),
  bankAccount("bank-daebang-002", "안동연(대방동지주택)", "하나은행", "56291000762005", "운영계좌", "2012-05-14", { accountPurpose: "조합 운영비", currentBalance: 169087 }),
  bankAccount("bank-daebang-003", "조합 여직원명의", "신한은행", "110-365-172420", "운영계좌", "2012-05-29", { accountPurpose: "조합 운영비", currentBalance: 1737852 }),
  bankAccount("bank-daebang-004", "대방동지역주택조합", "기업은행", "071-114261-04-017", "운영계좌", "2021-02-26", { accountPurpose: "조합 운영비", currentBalance: 71, verifiedAt: "2026-08-24" }),
  bankAccount("bank-daebang-005", "무궁화신탁(업무대행비)", "우리은행", "1005-403-950770", "신탁계좌", "2020-04-29", { accountPurpose: "신탁관리", currentBalance: 304785952 }),
  bankAccount("bank-daebang-006", "무궁화신탁(분담금)", "우리은행", "1005-503-950527", "신탁계좌", "2020-05-02", { accountPurpose: "신탁관리", currentBalance: 99260064 }),
  bankAccount("bank-daebang-007", "대방동지역주택조합", "국민은행", "029301-04-179045", "운영계좌", "2012-11-02", { accountPurpose: "조합 운영비", currentBalance: 5475, verifiedAt: "2026-08-25" }),
  bankAccount("bank-daebang-008", "대방동지역주택조합", "신협은행", "131-022-540467", "운영계좌", "2024-12-04", { accountPurpose: "조합 운영비", currentBalance: 1224905, verifiedAt: "2026-09-10" }),
  bankAccount("bank-daebang-009", "대방동지역주택조합", "마을금고", "9002-2094-4050-7", "운영계좌", "2026-08-14", { accountPurpose: "조합 운영비" }),
  bankAccount("bank-daebang-010", "KB부동산신탁(분담금)", "KB은행", "349401-04-368831", "신탁계좌", "2026-09-11", { accountPurpose: "신탁관리" }),
  bankAccount("bank-daebang-011", "KB부동산신탁(신청금)", "KB은행", "349401-04-368844", "신탁계좌", "2026-09-11", { accountPurpose: "신탁관리" }),
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

function bankAccount(
  id: string,
  accountName: string,
  bankName: string,
  accountNo: string,
  accountType: RegisteredBankAccount["accountType"],
  createdAt: string,
  details: Pick<RegisteredBankAccount, "accountPurpose" | "closedAt" | "currentBalance" | "verifiedAt"> = {},
): RegisteredBankAccount {
  return {
    ...details,
    accountName,
    accountNo,
    accountType,
    bankName,
    createdAt,
    id,
    lastSyncedAt: "미연동",
    status: "확인필요",
    unmatchedCount: 0,
    usageStatus: "사용",
  };
}

export function getBusinessPartnerSummary(partners: BusinessPartner[] = businessPartners) {
  return {
    totalPartners: partners.length,
    receivablePartners: partners.filter((partner) => partner.balanceType === "채권").length,
    payablePartners: partners.filter((partner) => partner.balanceType === "채무").length,
    missingEvidenceProfiles: partners.filter((partner) => partner.evidenceProfileStatus === "미비").length,
  };
}
