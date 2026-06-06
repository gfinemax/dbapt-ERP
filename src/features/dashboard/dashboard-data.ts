export type Tone = "blue" | "orange" | "purple" | "mustard" | "green" | "neutral";

export type DashboardStat = {
  label: string;
  value: string;
  description: string;
  tone: Tone;
};

export type DashboardModule = {
  name: string;
  source: string;
  description: string;
  metric: string;
  tone: Tone;
};

export type IntegrationStatus = {
  source: string;
  module: string;
  status: "정상" | "지연" | "확인";
  lastSync: string;
  read: "가능" | "보류";
  write: "보류";
};

export type DashboardWarning = {
  title: string;
  detail: string;
  tone: Tone;
};

export type DashboardTask = {
  title: string;
  description: string;
};

export type DashboardActivity = {
  time: string;
  text: string;
};

export const dashboardStats: DashboardStat[] = [
  {
    label: "전체 조합원",
    value: "1,248명",
    description: "peopleON 원장 기준",
    tone: "blue",
  },
  {
    label: "납부율",
    value: "82.4%",
    description: "분담금 납부 완료 비율",
    tone: "green",
  },
  {
    label: "예산 집행률",
    value: "64.8%",
    description: "승인 지출 기준",
    tone: "mustard",
  },
  {
    label: "토지 확보율",
    value: "71.2%",
    description: "db-landon 필지 기준",
    tone: "orange",
  },
  {
    label: "다음 총회",
    value: "D-12",
    description: "2026 정기총회 준비중",
    tone: "purple",
  },
];

export const dashboardModules: DashboardModule[] = [
  {
    name: "조합원관리",
    source: "peopleON",
    description: "조합원 원장, 권리, 납부, 정산 상태를 확인합니다.",
    metric: "미납 38건",
    tone: "blue",
  },
  {
    name: "회계/자금",
    source: "ERP Core",
    description: "입출금, 계정과목, 예산 집행, 신탁/대행/시공 지출을 관리합니다.",
    metric: "미승인 지출 6건",
    tone: "mustard",
  },
  {
    name: "총회관리",
    source: "VoteCast",
    description: "총회 출석, 위임, 서면결의, 안건 결과를 요약합니다.",
    metric: "총회 D-12",
    tone: "purple",
  },
  {
    name: "토지관리",
    source: "db-landon",
    description: "필지, 소유자, 계약 상태와 확보율을 추적합니다.",
    metric: "확보율 71.2%",
    tone: "orange",
  },
  {
    name: "수지분석",
    source: "valueON",
    description: "사업성 시나리오와 최신 분석 기준일을 비교합니다.",
    metric: "검토중",
    tone: "mustard",
  },
  {
    name: "문서/공지",
    source: "dbapt-site",
    description: "홈페이지, 포털 공지, 자료실 공개 상태를 관리합니다.",
    metric: "연결 확인",
    tone: "neutral",
  },
];

export const integrationStatuses: IntegrationStatus[] = [
  {
    source: "peopleON",
    module: "조합원관리",
    status: "정상",
    lastSync: "3분 전",
    read: "가능",
    write: "보류",
  },
  {
    source: "VoteCast",
    module: "총회관리",
    status: "정상",
    lastSync: "5분 전",
    read: "가능",
    write: "보류",
  },
  {
    source: "db-landon",
    module: "토지관리",
    status: "지연",
    lastSync: "2시간 전",
    read: "가능",
    write: "보류",
  },
  {
    source: "valueON",
    module: "수지분석",
    status: "정상",
    lastSync: "1일 전",
    read: "가능",
    write: "보류",
  },
  {
    source: "dbapt-site",
    module: "홈페이지/포털",
    status: "확인",
    lastSync: "미연결",
    read: "보류",
    write: "보류",
  },
];

export const dashboardWarnings: DashboardWarning[] = [
  {
    title: "미납 38건",
    detail: "납부 안내 발송 대상입니다.",
    tone: "orange",
  },
  {
    title: "서류 미비 12건",
    detail: "조합원 상세에서 보완 요청이 필요합니다.",
    tone: "mustard",
  },
  {
    title: "미승인 지출 6건",
    detail: "신탁/대행/시공 관련 지출 검토가 필요합니다.",
    tone: "mustard",
  },
  {
    title: "토지 협의 지연 4필지",
    detail: "최근 업데이트가 7일 이상 없습니다.",
    tone: "orange",
  },
  {
    title: "총회 위임장 부족",
    detail: "성원 충족 예상치가 기준선에 가깝습니다.",
    tone: "purple",
  },
];

export const dashboardTasks: DashboardTask[] = [
  {
    title: "조합원 등록 검토",
    description: "검토중 상태 7건",
  },
  {
    title: "미납 안내 발송",
    description: "SMS 발송 대상 38명",
  },
  {
    title: "지출 승인 검토",
    description: "승인 대기 6건",
  },
  {
    title: "총회 참석 현황 확인",
    description: "위임장 접수율 점검",
  },
  {
    title: "토지 협의 기록 업데이트",
    description: "지연 필지 담당자 확인",
  },
];

export const dashboardActivity: DashboardActivity[] = [
  {
    time: "15:20",
    text: "조합원 김OO 연락처가 수정되었습니다.",
  },
  {
    time: "14:10",
    text: "납부 증빙 3건이 문서함에 등록되었습니다.",
  },
  {
    time: "13:55",
    text: "업무대행비 지출 요청 1건이 승인 대기로 등록되었습니다.",
  },
  {
    time: "13:40",
    text: "db-landon 토지 확보율 동기화가 지연되었습니다.",
  },
];
