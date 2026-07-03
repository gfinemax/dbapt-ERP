export type ReportSection = "overview" | "performance" | "cash-flow" | "budget";

export type ReportStatus = "작성예정" | "초안" | "검토중" | "승인완료" | "공개완료" | "수정필요";

export type GeneratedReportRun = {
  id: string;
  generationDate: string;
  kind: "실적보고서" | "자금입출금명세서" | "운영비 예산";
  period: string;
  periodEnd: string;
  periodStart: string;
  publicationStatus: "공개대기" | "공개완료" | "비공개";
  publicationTargets: string[];
  status: ReportStatus;
  title: string;
  updatedReason?: string;
  version: number;
};

export type ReportTableSection = {
  title: string;
  asOf?: string;
  rows: string[][];
};

export type StatutoryFundReportDocumentKey = "monthly-cash-flow" | "annual-fund-plan" | "quarterly-business-performance";

export type StatutoryFundReportDocument = {
  description: string;
  dialogLabel: string;
  key: StatutoryFundReportDocumentKey;
  period: string;
  sections: ReportTableSection[];
  summary: Array<{
    label: string;
    value: string;
  }>;
  title: string;
  unit: string;
};

export const reportFontFamily = '"Trebuchet MS", "Malgun Gothic", sans-serif';

export const reportAutomationRules = [
  {
    description: "분기 종료 후 누락 지출과 운영비 집행액을 반영해 DOCX 초안을 생성합니다.",
    schedule: "분기 종료 다음 달 1일",
    target: "홈페이지/정보몽땅 공개",
    title: "실적보고서",
  },
  {
    description: "대상월의 입금, 출금, 운영비 세부내역을 반영해 XLSX 초안을 생성합니다.",
    schedule: "대상월 다음 달 1일",
    target: "홈페이지/정보몽땅 공개",
    title: "자금입출금명세서",
  },
  {
    description: "연간 운영비 예산과 월별 집행액을 비교할 기준표로 관리합니다.",
    schedule: "연 1회 예산 확정 시",
    target: "내부 기준자료",
    title: "운영비 예산",
  },
];

export const generatedReportRuns: GeneratedReportRun[] = [
  {
    id: "cash-flow-2026-01",
    generationDate: "2026-02-01",
    kind: "자금입출금명세서",
    period: "2026년 1월",
    periodEnd: "2026-01-31",
    periodStart: "2026-01-01",
    publicationStatus: "공개완료",
    publicationTargets: ["홈페이지", "정보몽땅"],
    status: "공개완료",
    title: "2026년 1월 자금입출금명세서",
    version: 1,
  },
  {
    id: "cash-flow-2026-02",
    generationDate: "2026-03-01",
    kind: "자금입출금명세서",
    period: "2026년 2월",
    periodEnd: "2026-02-28",
    periodStart: "2026-02-01",
    publicationStatus: "공개완료",
    publicationTargets: ["홈페이지", "정보몽땅"],
    status: "공개완료",
    title: "2026년 2월 자금입출금명세서",
    version: 1,
  },
  {
    id: "performance-2026-q1",
    generationDate: "2026-04-01",
    kind: "실적보고서",
    period: "2026년 1분기",
    periodEnd: "2026-03-31",
    periodStart: "2026-01-01",
    publicationStatus: "공개대기",
    publicationTargets: ["홈페이지", "정보몽땅"],
    status: "수정필요",
    title: "2026년 1분기 실적보고서",
    updatedReason: "3월 누락 지출내역 반영 필요",
    version: 2,
  },
  {
    id: "cash-flow-2026-03",
    generationDate: "2026-04-01",
    kind: "자금입출금명세서",
    period: "2026년 3월",
    periodEnd: "2026-03-31",
    periodStart: "2026-03-01",
    publicationStatus: "공개대기",
    publicationTargets: ["홈페이지", "정보몽땅"],
    status: "수정필요",
    title: "2026년 3월 자금입출금명세서",
    updatedReason: "운영비 세부 지출 누락분 반영 필요",
    version: 2,
  },
  {
    id: "cash-flow-2026-04",
    generationDate: "2026-05-01",
    kind: "자금입출금명세서",
    period: "2026년 4월",
    periodEnd: "2026-04-30",
    periodStart: "2026-04-01",
    publicationStatus: "공개대기",
    publicationTargets: ["홈페이지", "정보몽땅"],
    status: "검토중",
    title: "2026년 4월 자금입출금명세서",
    version: 1,
  },
  {
    id: "cash-flow-2026-05",
    generationDate: "2026-06-01",
    kind: "자금입출금명세서",
    period: "2026년 5월",
    periodEnd: "2026-05-31",
    periodStart: "2026-05-01",
    publicationStatus: "공개대기",
    publicationTargets: ["홈페이지", "정보몽땅"],
    status: "초안",
    title: "2026년 5월 자금입출금명세서",
    version: 1,
  },
  {
    id: "performance-2026-q2",
    generationDate: "2026-07-01",
    kind: "실적보고서",
    period: "2026년 2분기",
    periodEnd: "2026-06-30",
    periodStart: "2026-04-01",
    publicationStatus: "비공개",
    publicationTargets: ["홈페이지", "정보몽땅"],
    status: "작성예정",
    title: "2026년 2분기 실적보고서",
    version: 1,
  },
];

export const quarterlyPerformanceReport = {
  title: "대방동 지역주택조합 실적보고서",
  period: "2026.1.1.부터 2026.3.31.까지",
  status: "분기별 의무 작성",
  sourceDocument: {
    label: "DOCX 원본 양식",
    href: "/templates/reports/performance-report-q1-2026.docx",
  },
  basis: "※근거: 주택법 제 12조(실적보고 및 관련 자료의 공개) 및 주택법 시행령 제25조(자료공개등)",
  sections: [
    {
      title: "조합원 모집 현황",
      asOf: "2026.03.31 현재",
      rows: [
        ["주택형", "1차조합원", "2차조합원", "비고"],
        ["59m(25평)", "17명", "", "1차조합원 조합변경인가 신청중(조합원 현행화)"],
        ["84m(33평)", "39명", "", ""],
        ["미확정", "60명", "", ""],
        ["합계", "116명", "", ""],
      ],
    },
    {
      title: "해당 주택건설대지의 사용권원 및 소유권 확보 현황",
      asOf: "2026.03.31 현재",
      rows: [
        ["전체면적", "구분", "전체면적", "사용권원", "소유권면적", "비고"],
        ["12,851.22m2", "사유지", "11,551.22m2", "0%", "0%", "계약 관계 현실화"],
        ["", "국공유지", "1300m2", "0%", "0%", "협의대상"],
      ],
    },
    {
      title: "주택조합사업에 필요한 관련 법령에 따른 신고, 승인 및 인허가 등의 추진 현황",
      asOf: "2026.03.31 현재",
      rows: [
        ["항목", "승인일", "예정일", "처리결과", "비고"],
        ["조합설립", "2009.07.13", "", "인가", ""],
        ["지구단위계획", "2022.06.30", "", "결정고시", ""],
        ["건축인허가 / (건축심의 및 사업승인)", "", "2027.06.01", "준비중", "통합심의로 진행"],
      ],
    },
    {
      title: "토지용역, 설계자, 시공자 및 업무대행자 등과의 계약체결 현황",
      asOf: "2026.03.31 현재",
      rows: [
        ["구분", "업체명", "업무내용", "계약일"],
        ["업무대행사", "위더스포유", "업무대행", "2026.01.7"],
        ["", "", "", ""],
        ["", "", "", ""],
        ["", "", "", ""],
      ],
    },
    {
      title: "운영비 예산",
      asOf: "2025.06.30 현재",
      rows: [
        ["(단위: 천원, VAT포함)"],
        ["항목", "1분기"],
        ["", "금액"],
        ["수입", "전월말 현금예금 잔액", "1,225"],
        ["", "조합원분담금", "모집조합원", "-"],
        ["", "", "지주조합원", "-"],
        ["", "", "소계", "-"],
        ["", "일반분양수입", "공동주택", "-"],
        ["", "", "근린상가", "-"],
        ["", "", "소계", "-"],
        ["", "업무대행비", "-"],
        ["", "차입금", "금융기관 차입금", "-"],
        ["", "", "조합원 차입금", "-"],
        ["", "", "기타 차입금", "19,500"],
        ["", "", "소계", "19,500"],
        ["", "기타수입", "임대보증금", "-"],
        ["", "", "임대수입", "-"],
        ["", "", "중도금대출 이자", "-"],
        ["", "", "기타수입", "3"],
        ["", "", "소계", "3"],
        ["", "합계", "20,728"],
        ["지출", "사업비", "토지매입비", "토지비", "-"],
        ["", "", "", "취득세 등 제세금", "-"],
        ["", "", "", "토지용역비", "-"],
        ["", "", "", "소계", "-"],
        ["", "", "공사비", "공사비", "-"],
        ["", "", "", "기반시설공사비", "-"],
        ["", "", "", "철거비", "-"],
        ["", "", "", "소계", "-"],
        ["", "", "설계 감리비", "설계비", "-"],
        ["", "", "", "감리비", "-"],
        ["", "", "", "소계", "-"],
        ["", "", "업무대행비", "-"],
        ["", "", "신탁보수", "-"],
        ["", "", "판매관리비", "견본주택신축비", "-"],
        ["", "", "", "견본주택임차료", "-"],
        ["", "", "", "견본주택운영비", "-"],
        ["", "", "", "광고선전비", "-"],
        ["", "", "", "모집대행수수료", "-"],
        ["", "", "", "분양수수료", "-"],
        ["", "", "", "각종 보상금", "-"],
        ["", "", "", "소계", "-"],
        ["", "", "제세공과금", "보존등기비", "-"],
        ["", "", "", "재산세 등 보유세", "-"],
        ["", "", "", "법인세 등", "-"],
        ["", "", "", "상하수도분담금", "-"],
        ["", "", "", "광역교통시설부담금", "-"],
        ["", "", "", "학교용지부담금", "-"],
        ["", "", "", "기타부담금", "-"],
        ["", "", "", "소계", "-"],
        ["", "", "외주용역비", "감정평가수수료", "-"],
        ["", "", "", "세무회계용역비", "3,000"],
        ["", "", "", "소송 및 법무용역비", "-"],
        ["", "", "", "지구단위(도시설계)용역비", "-"],
        ["", "", "", "기타외주용역비", "-"],
        ["", "", "", "소계", "3,000"],
        ["", "", "금융비용", "금융기관차입금이자", "-"],
        ["", "", "", "조합원차입금 이자", "-"],
        ["", "", "", "기타 차입금이자", "-"],
        ["", "", "", "금융자문수수료", "-"],
        ["", "", "", "대출취급수수료", "-"],
        ["", "", "", "기타금융관련비용", "-"],
        ["", "", "", "소계", "-"],
        ["", "", "기타사업비", "총회비", "3,000"],
        ["", "", "", "공가관리비", "-"],
        ["", "", "", "기타사업비", "-"],
        ["", "", "", "소계", "3,000"],
        ["", "", "기타지출", "차입금 상환", "1,000"],
        ["", "", "", "임차보증금", "-"],
        ["", "", "", "중도금대출이자", "-"],
        ["", "", "", "분담금 환불금", "-"],
        ["", "", "", "업무대행비 환불금", "-"],
        ["", "", "", "기타지출", "-"],
        ["", "", "", "소계", "1,000"],
        ["", "", "에비비", "-"],
        ["", "운영비", "인건비", "급여", "조합장", "-"],
        ["", "", "", "", "상근임원", "-"],
        ["", "", "", "", "직원", "-"],
        ["", "", "", "상여금", "조합장", "-"],
        ["", "", "", "", "상근임원", "-"],
        ["", "", "", "", "직원", "-"],
        ["", "", "", "퇴직금", "-"],
        ["", "", "", "기타인건비", "-"],
        ["", "", "", "소계", "-"],
        ["", "", "복리후생비", "794"],
        ["", "", "업무추진비", "76"],
        ["", "", "회의비", "이사회의비", "-"],
        ["", "", "", "감사비", "-"],
        ["", "", "", "기타회의비", "-"],
        ["", "", "", "소계", "-"],
        ["", "", "일반운영비", "자산취득비", "-"],
        ["", "", "", "지급임차료", "8,005"],
        ["", "", "", "도서인쇄비", "-"],
        ["", "", "", "소모품비", "20"],
        ["", "", "", "수선비", "-"],
        ["", "", "", "소계", "8,025"],
        ["", "", "제세공과금", "통신비", "191"],
        ["", "", "", "여비교통비", "138"],
        ["", "", "", "수도광열비", "-"],
        ["", "", "", "지급수수료", "14"],
        ["", "", "", "소계", "343"],
        ["", "", "기타운영비", "-"],
        ["", "", "예비비", "-"],
        ["", "분기말 현금예금잔액(*1)", "4,490"],
        ["합계", "20,728"],
      ],
    },
  ] satisfies ReportTableSection[],
};

export const cashFlowStatement = {
  month: "2026년 3월",
  title: "2026년 3월 자금 입출금명세서",
  unit: "(단위: 원,VAT포함)",
  rows: [
    ["항목", "세부항목", "금액"],
    ["수입", "전월말 현금예금 잔액", "254,894"],
    ["", "기타 차입금", "19,500,000"],
    ["", "기타수입", "3,000"],
    ["", "합계", "20,728,000"],
    ["지출", "세무회계용역비", "3,000,000"],
    ["", "총회비", "3,000,000"],
    ["", "차입금 상환", "1,000,000"],
    ["", "운영비", "9,238,000"],
    ["", "분기말 현금예금잔액(*1)", "4,490,000"],
    ["합계", "", "20,728,000"],
  ],
  detailRows: [
    ["No", "세부항목", "금액", "비고"],
    ["1", "복리후생비(식대)", "77,000", "식대"],
    ["2", "업무추진비", "19,700", ""],
    ["3", "일반운영비_지급임차료", "8,005,000", "IFC서울관리단 등"],
    ["4", "일반운영비_소모품비", "20,500", ""],
    ["5", "제세공과금_통신비", "75,310", "LGU+ 등"],
    ["6", "제세공과금_여비교통비", "60,000", "주유/주차료/철도"],
    ["7", "제세공과금_지급수수료", "8,600", "직접지급 5,400 + 송금수수료 3,200"],
    ["합  계", "", "8,266,110", ""],
  ],
};

export const statutoryFundReportDocuments: StatutoryFundReportDocument[] = [
  {
    description: "월별 입금, 출금, 운영비 세부내역과 월말 잔액을 감사 대응용으로 출력합니다.",
    dialogLabel: "월별 자금 입출금 명세서",
    key: "monthly-cash-flow",
    period: "2026년 3월",
    title: "2026년 3월 월별 자금 입출금 명세서",
    unit: "(단위: 원, VAT포함)",
    summary: [
      { label: "작성월", value: cashFlowStatement.month },
      { label: "당월 수입 합계", value: formatKrw(20728000) },
      { label: "당월 지출 합계", value: formatKrw(16238000) },
      { label: "월말 현금예금 잔액", value: formatKrw(4490000) },
    ],
    sections: [
      {
        title: "자금 입출금 요약",
        rows: [
          ["구분", "항목", "금액"],
          ["수입", "전월말 현금예금 잔액", "254,894원"],
          ["수입", "기타 차입금", "19,500,000원"],
          ["수입", "기타수입", "3,000원"],
          ["수입", "당월 수입 합계", "20,728,000원"],
          ["지출", "세무회계용역비", "3,000,000원"],
          ["지출", "총회비", "3,000,000원"],
          ["지출", "차입금 상환", "1,000,000원"],
          ["지출", "운영비", "9,238,000원"],
          ["잔액", "월말 현금예금 잔액", "4,490,000원"],
        ],
      },
      {
        title: "운영비 세부내역",
        rows: cashFlowStatement.detailRows.map((row, rowIndex) =>
          rowIndex === 0
            ? row
            : row.map((cell, cellIndex) => (cellIndex === 2 && cell && !cell.endsWith("원") ? `${cell}원` : cell)),
        ),
      },
    ],
  },
  {
    description: "연간 수입원, 지출 예정액, 운영비 예산, 기말 운용잔액을 한 장의 계획서로 관리합니다.",
    dialogLabel: "연간 자금운용 계획서",
    key: "annual-fund-plan",
    period: "2026/01/01 ~ 2026/12/31",
    title: "2026년 연간 자금운용 계획서",
    unit: "(단위: 원, VAT포함)",
    summary: [
      { label: "연간 계획수입", value: formatKrw(1854000000) },
      { label: "연간 계획지출", value: formatKrw(1747254968) },
      { label: "운영비 예산", value: formatKrw(242254968) },
      { label: "기말 운용예정잔액", value: formatKrw(106745032) },
    ],
    sections: [
      {
        title: "자금수입 계획",
        rows: [
          ["구분", "계획금액", "산출근거"],
          ["조합원 분담금", "1,140,000,000원", "월별 분담금 수납 계획"],
          ["업무대행비 수입", "300,000,000원", "계약 기준 예정 수납"],
          ["차입금", "380,000,000원", "운영 및 사업비 유동성 확보"],
          ["기타수입", "34,000,000원", "임대보증금, 이자 등"],
          ["합계", "1,854,000,000원", ""],
        ],
      },
      {
        title: "자금지출 계획",
        rows: [
          ["구분", "계획금액", "산출근거"],
          ["토지매입비", "950,000,000원", "토지 계약 및 관련 제세금"],
          ["용역비", "315,000,000원", "감정평가, 법무, 세무, 업무대행"],
          ["운영비", "242,254,968원", "2026년 운영비 예산(안)"],
          ["환불금", "203,310,000원", "조합원 환불 예정액"],
          ["차입금상환", "36,690,000원", "원금 및 이자 상환"],
          ["합계", "1,747,254,968원", ""],
        ],
      },
      {
        title: "연간 자금수지",
        rows: [
          ["항목", "금액", "비고"],
          ["연간 계획수입", "1,854,000,000원", ""],
          ["연간 계획지출", "1,747,254,968원", ""],
          ["기말 운용예정잔액", "106,745,032원", "수입-지출 기준"],
        ],
      },
    ],
  },
  {
    description: "분기별 사업 추진, 조합원 모집, 인허가, 지급 및 증빙관리 현황을 보고서 형태로 출력합니다.",
    dialogLabel: "분기별 사업실적보고서",
    key: "quarterly-business-performance",
    period: "2026.1.1. ~ 2026.3.31.",
    title: "2026년 1분기 사업실적보고서",
    unit: "(단위: 원, VAT포함)",
    summary: [
      { label: "보고분기", value: "2026년 1분기" },
      { label: "조합원 현황", value: "116명" },
      { label: "분기 수입/지출", value: "20,728,000원" },
      { label: "분기말 잔액", value: "4,490,000원" },
    ],
    sections: [
      {
        title: "사업추진 실적",
        rows: [
          ["항목", "진행상태", "비고"],
          ["조합설립인가", "완료", "2009.07.13 인가"],
          ["지구단위계획", "완료", "2022.06.30 결정고시"],
          ["건축심의 및 사업승인", "준비중", "통합심의 진행 예정"],
        ],
      },
      {
        title: "조합원 모집 현황",
        rows: quarterlyPerformanceReport.sections[0].rows,
      },
      {
        title: "지급 및 증빙관리",
        rows: [
          ["구분", "건수", "금액", "증빙상태"],
          ["지출결의 승인대기", "3건", "12,300,000원", "검토중"],
          ["지급완료", "4건", "1,447,610,000원", "이체확인증 연결"],
          ["증빙 미첨부", "2건", "315,000,000원", "보완 필요"],
        ],
      },
      {
        title: "인허가 추진 현황",
        rows: quarterlyPerformanceReport.sections[2].rows,
      },
    ],
  },
];

export const operatingBudget = {
  title: "2026년 운영비 예산(안)",
  currentPeriod: "(당기 : 2026/01/01 ~ 2026/12/31)",
  previousPeriod: "(전기 : 2025/01/01 ~ 2025/12/31)",
  unit: "(단위: 원, VAT포함)",
  headers: ["항목", "목", "세목", "월 예산", "2025년(전기) 연간예산", "2026년(당기) 연간예산", "내역 및 산출근거"],
  rows: [
    ["인건비", "급여", "조합장", "4,000,000", "51,600,000", "51,600,000", "조합장 급여"],
    ["", "", "사무장", "3,500,000", "42,000,000", "42,000,000", "사무장 급여"],
    ["", "", "사무직원", "2,300,000", "27,600,000", "27,600,000", "사무직원 급여"],
    ["", "상여금", "", "3,266,667", "39,200,004", "39,200,004", "연 4회 지급"],
    ["", "보험료", "", "929,580", "11,154,960", "11,154,960", "조합부담 4대 보험료"],
    ["", "퇴직예치금", "", "816,667", "9,800,004", "9,800,004", "조합장, 직원 퇴직금 (상근자 1년이상)"],
    ["", "소 계", "", "", "181,354,968", "181,354,968", ""],
  ],
};

export function formatKrw(amount: number) {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function dateString(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function getMonthlyGenerationDate(year: number, month: number) {
  if (month === 12) {
    return dateString(year + 1, 1, 1);
  }

  return dateString(year, month + 1, 1);
}

export function getQuarterlyGenerationDate(year: number, quarter: number) {
  const nextMonth = quarter * 3 + 1;

  if (nextMonth > 12) {
    return dateString(year + 1, 1, 1);
  }

  return dateString(year, nextMonth, 1);
}

export function findImpactedReportRuns(expenseDate: string) {
  const [yearPart, monthPart] = expenseDate.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const quarter = Math.ceil(month / 3);

  return [`cash-flow-${year}-${pad2(month)}`, `performance-${year}-q${quarter}`];
}

export function getScheduledReportRuns(currentDate: string) {
  return generatedReportRuns.filter((report) => report.generationDate <= currentDate);
}

export function getReportSummary() {
  return {
    memberTotal: "116명",
    cashFlowClosingBalance: formatKrw(4490000),
    monthlyOperatingExpense: formatKrw(8266110),
    annualBudget: formatKrw(181354968),
  };
}
