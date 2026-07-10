export type AccountSubjectType = "수입" | "지출" | "자산" | "부채" | "정산";
export type AccountSubjectNormalBalance = "차변" | "대변";
export type AccountSubjectSource = "운영비 예산안" | "수지분석표" | "직접등록";
export type AccountSubjectBusinessCategory =
  | "수입"
  | "인건비"
  | "운영비"
  | "사업추진비"
  | "토지비"
  | "공사비"
  | "인허가·부담금"
  | "분양제비용"
  | "기타개발비"
  | "등기·법무비"
  | "금융비용"
  | "정산·환불"
  | "미분류";

export type RegisteredAccountSubject = {
  aliases: string[];
  businessCategory: AccountSubjectBusinessCategory;
  code: string;
  description: string;
  id: string;
  isActive: boolean;
  name: string;
  normalBalance: AccountSubjectNormalBalance;
  parentId: string | null;
  sortOrder: number;
  source: AccountSubjectSource;
  subjectType: AccountSubjectType;
};

export type AccountSubjectRecommendation = Omit<RegisteredAccountSubject, "id" | "isActive" | "parentId">;

export const registeredAccountSubjects: RegisteredAccountSubject[] = [
  {
    aliases: ["분담금", "조합원 납입금"],
    businessCategory: "수입",
    code: "IN-100",
    description: "조합원 분담금 및 납입금 수납",
    id: "account-subject-income-member",
    isActive: true,
    name: "조합원 분담금 수입",
    normalBalance: "대변",
    parentId: null,
    sortOrder: 100,
    source: "직접등록",
    subjectType: "수입",
  },
  {
    aliases: ["법무자문", "소송비"],
    businessCategory: "등기·법무비",
    code: "DEV-810",
    description: "법무 자문, 소송, 계약 검토 비용",
    id: "account-subject-legal",
    isActive: true,
    name: "법무비",
    normalBalance: "차변",
    parentId: null,
    sortOrder: 810,
    source: "직접등록",
    subjectType: "지출",
  },
  {
    aliases: ["토지대", "토지 매입"],
    businessCategory: "토지비",
    code: "LAND-100",
    description: "사업부지 토지 매입비",
    id: "account-subject-land",
    isActive: true,
    name: "토지매입비",
    normalBalance: "차변",
    parentId: null,
    sortOrder: 410,
    source: "수지분석표",
    subjectType: "지출",
  },
  {
    aliases: ["세무자문", "세무대리"],
    businessCategory: "운영비",
    code: "OP-390",
    description: "세무 자문 및 신고 관련 비용",
    id: "account-subject-tax",
    isActive: true,
    name: "세무비",
    normalBalance: "차변",
    parentId: null,
    sortOrder: 390,
    source: "직접등록",
    subjectType: "지출",
  },
  {
    aliases: ["감평비", "감정평가"],
    businessCategory: "토지비",
    code: "LAND-160",
    description: "토지 및 사업성 검토 감정평가 비용",
    id: "account-subject-appraisal",
    isActive: true,
    name: "감정평가비",
    normalBalance: "차변",
    parentId: null,
    sortOrder: 460,
    source: "수지분석표",
    subjectType: "지출",
  },
  {
    aliases: ["PF 수수료", "프로젝트파이낸싱 수수료"],
    businessCategory: "금융비용",
    code: "FIN-010",
    description: "PF 대출 실행 및 약정 수수료",
    id: "account-subject-pf-fee",
    isActive: true,
    name: "PF수수료",
    normalBalance: "차변",
    parentId: null,
    sortOrder: 910,
    source: "수지분석표",
    subjectType: "지출",
  },
];

export const accountSubjectRecommendations: AccountSubjectRecommendation[] = [
  recommendation("PAY-110", "급여", "인건비", "운영비 예산안", "조합장, 사무장, 사무직원 급여", 110, ["인건비", "직원급여"]),
  recommendation("PAY-120", "상여금", "인건비", "운영비 예산안", "연 4회 지급 상여금", 120, ["보너스"]),
  recommendation("PAY-130", "보험료", "인건비", "운영비 예산안", "조합 부담 4대 보험료", 130, ["4대보험", "사회보험료"]),
  recommendation("PAY-140", "퇴직예치금", "인건비", "운영비 예산안", "조합장 및 직원 퇴직금 예치", 140, ["퇴직금", "퇴직급여충당"]),
  recommendation("PRJ-210", "감사비", "사업추진비", "운영비 예산안", "감사 참석 및 활동 비용", 210, ["감사수당"]),
  recommendation("PRJ-220", "회의비", "사업추진비", "운영비 예산안", "임원, 대의원 회의 비용", 220, ["회의수당"]),
  recommendation("PRJ-230", "업무추진비", "사업추진비", "운영비 예산안", "사업추진 관련 경조사 및 대외 업무비", 230, ["경조사비"]),
  recommendation("OP-310", "임대료", "운영비", "운영비 예산안", "사무실 임차료 등", 310, ["임차료", "사무실 임대료"]),
  recommendation("OP-320", "도서인쇄비", "운영비", "운영비 예산안", "신문, 소식지, 업무 관련 인쇄비", 320, ["인쇄비", "신문구독료"]),
  recommendation("OP-330", "사무등록비", "운영비", "운영비 예산안", "복사기, 회선, 기타 등록성 비용", 330, ["복사기", "회선료"]),
  recommendation("OP-340", "사무용품비", "운영비", "운영비 예산안", "생수, 커피, 음료 및 사무용품", 340, ["사무비품", "소모성 사무용품"]),
  recommendation("OP-350", "소모품비", "운영비", "운영비 예산안", "복사용지, 토너 및 각종 소모품", 350, ["토너", "복사용지"]),
  recommendation("OP-360", "복리후생비", "운영비", "운영비 예산안", "식비 등 복리후생 지출", 360, ["식대", "간식비"]),
  recommendation("OP-370", "수선비", "운영비", "운영비 예산안", "사무실 및 제반 수리비", 370, ["수리비"]),
  recommendation("OP-380", "광고비", "운영비", "운영비 예산안", "신문광고, 현수막, 홍보비", 380, ["홍보비", "현수막"]),
  recommendation("OP-400", "수도광열비", "운영비", "운영비 예산안", "수도, 전기, 가스요금", 400, ["전기요금", "가스요금"]),
  recommendation("OP-410", "통신비", "운영비", "운영비 예산안", "전화, 팩스, 인터넷 비용", 410, ["인터넷", "전화요금"]),
  recommendation("OP-420", "여비교통비", "운영비", "운영비 예산안", "유관기관 방문 교통비 및 주유비", 420, ["교통비", "주유비"]),
  recommendation("OP-430", "지급수수료", "운영비", "운영비 예산안", "송금수수료, 공문 발급 수수료", 430, ["송금수수료", "수수료"]),
  recommendation("OP-440", "예비비", "운영비", "운영비 예산안", "인건비 제외 운영비의 예비성 지출", 440, ["비상예산"]),
  recommendation("LAND-100", "토지매입비", "토지비", "수지분석표", "사업부지 토지 매입비", 410, ["토지대", "토지 매입"]),
  recommendation("LAND-110", "국유지매입비", "토지비", "수지분석표", "국유지 매입 및 관련 취득 비용", 411, ["국유지"]),
  recommendation("LAND-120", "취득세·등록세", "토지비", "수지분석표", "토지 취득, 등록세 등 제세공과금", 412, ["취등록세", "취득등록세"]),
  recommendation("LAND-130", "법무사비용", "등기·법무비", "수지분석표", "등기 및 법무사 수수료", 413, ["법무사수수료"]),
  recommendation("LAND-140", "명도비", "토지비", "수지분석표", "명도예상비용 및 수수료", 414, ["명도예상비용"]),
  recommendation("LAND-150", "지주작업비", "토지비", "수지분석표", "토지 소유자 협의 및 작업 비용", 415, ["지주협의비"]),
  recommendation("BUILD-510", "직접공사비", "공사비", "수지분석표", "건축 직접공사비", 510, ["건축비"]),
  recommendation("BUILD-520", "철거공사비", "공사비", "수지분석표", "철거 및 지장물 이설 공사비", 520, ["철거비"]),
  recommendation("BUILD-530", "토목공사비", "공사비", "수지분석표", "토목공사 및 기반 공사비", 530, ["토목비"]),
  recommendation("BUILD-540", "설계비", "공사비", "수지분석표", "건축 및 관련 설계 용역비", 540, ["설계용역비"]),
  recommendation("BUILD-550", "감리비", "공사비", "수지분석표", "공사 감리 용역비", 550, ["감리용역비"]),
  recommendation("PERMIT-610", "인허가비", "인허가·부담금", "수지분석표", "인허가, 면허세, 지구단위 관련 비용", 610, ["면허세", "지구단위"]),
  recommendation("PERMIT-620", "광역교통시설부담금", "인허가·부담금", "수지분석표", "광역교통시설 부담금", 620, ["교통부담금"]),
  recommendation("SALE-710", "광고선전비", "분양제비용", "수지분석표", "분양 광고 및 선전 비용", 710, ["분양광고비"]),
  recommendation("SALE-720", "분양보증수수료", "분양제비용", "수지분석표", "분양보증 발급 수수료", 720, ["보증수수료"]),
  recommendation("SALE-730", "분양수수료", "분양제비용", "수지분석표", "세대별 분양 대행 수수료", 730, ["분양대행수수료"]),
  recommendation("DEV-820", "신탁수수료", "기타개발비", "수지분석표", "신탁사 자금관리 및 신탁 수수료", 820, ["신탁보수"]),
  recommendation("DEV-830", "조합정산비용", "정산·환불", "수지분석표", "조합 해산, 환불, 선투입비 정산", 830, ["선투입비 정산"]),
  recommendation("FIN-020", "PF이자", "금융비용", "수지분석표", "PF 대출 이자 비용", 920, ["PF 이자", "프로젝트파이낸싱 이자"]),
  recommendation("FIN-030", "브릿지론 이자 및 수수료", "금융비용", "수지분석표", "브릿지론 이자와 약정 수수료", 930, ["브릿지론"]),
  recommendation("FIN-040", "중도금 무이자 비용", "금융비용", "수지분석표", "중도금 무이자 조건에 따른 금융비용", 940, ["중도금이자"]),
];

function recommendation(
  code: string,
  name: string,
  businessCategory: AccountSubjectBusinessCategory,
  source: AccountSubjectSource,
  description: string,
  sortOrder: number,
  aliases: string[] = [],
): AccountSubjectRecommendation {
  return {
    aliases,
    businessCategory,
    code,
    description,
    name,
    normalBalance: source === "운영비 예산안" || source === "수지분석표" ? "차변" : "대변",
    sortOrder,
    source,
    subjectType: "지출",
  };
}

export function buildAccountSubjectFromRecommendation(recommendation: AccountSubjectRecommendation): RegisteredAccountSubject {
  return {
    ...recommendation,
    id: `account-subject-${recommendation.code.toLowerCase()}`,
    isActive: true,
    parentId: null,
  };
}

export function getSelectableAccountSubjectRecommendations(subjects: RegisteredAccountSubject[]) {
  const registeredNames = new Set(subjects.map((subject) => subject.name));

  return accountSubjectRecommendations.filter((recommendation) => !registeredNames.has(recommendation.name));
}

export function getAccountSubjectSummary(subjects: RegisteredAccountSubject[]) {
  const active = subjects.filter((subject) => subject.isActive);

  return {
    activeSubjects: active.length,
    expenseSubjects: active.filter((subject) => subject.subjectType === "지출").length,
    incomeSubjects: active.filter((subject) => subject.subjectType === "수입").length,
    valueOnReadySubjects: active.filter((subject) => subject.source === "수지분석표").length,
  };
}
