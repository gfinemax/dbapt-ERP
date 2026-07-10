import type { RegisteredAccountSubject } from "@/features/basic-info/account-subject-data";

export type BankTransactionColumnMap = {
  balanceAmount?: number;
  branchName?: number;
  depositAmount?: number;
  description?: number;
  transactionDate?: number;
  transactionKind?: number;
  transactionTime?: number;
  uploadedAccountTitle?: number;
  uploadedMajorCategory?: number;
  withdrawalAmount?: number;
};

export type BankTransactionMatchStatus = "업로드분류" | "자동추천" | "신규후보" | "미분류";

export type ParsedBankTransactionRow = {
  bankAccountId: string;
  bankAccountName: string;
  balanceAmount: number | null;
  branchName: string;
  depositAmount: number;
  description: string;
  matchStatus: BankTransactionMatchStatus;
  raw: Record<string, string>;
  recommendedAccountSubjectId: string | null;
  recommendedAccountSubjectName: string | null;
  transactedAt: string;
  transactionKind: "입금" | "출금";
  uploadedAccountTitle: string;
  uploadedMajorCategory: string;
  withdrawalAmount: number;
};

type ParseBankTransactionRowsInput = {
  accountSubjects: RegisteredAccountSubject[];
  headers: string[];
  rows: string[][];
  selectedBankAccountId: string;
  selectedBankAccountName: string;
};

type RecommendationInput = {
  accountSubjects: RegisteredAccountSubject[];
  branchName: string;
  description: string;
  transactionKind: "입금" | "출금";
  uploadedAccountTitle?: string;
  uploadedMajorCategory?: string;
};

type RecommendationResult = {
  matchStatus: BankTransactionMatchStatus;
  recommendedAccountSubjectId: string | null;
  recommendedAccountSubjectName: string | null;
};

const columnAliases: Record<keyof BankTransactionColumnMap, string[]> = {
  balanceAmount: ["잔액", "거래후잔액", "통장잔액"],
  branchName: ["거래점", "취급점", "처리점", "영업점", "상대은행"],
  depositAmount: ["입금", "입금액", "입금금액", "받은금액"],
  description: ["적요", "거래내용", "내용", "메모", "기재내용"],
  transactionDate: ["거래일자", "거래일", "일자", "날짜"],
  transactionKind: ["거래종류", "구분", "입출금구분", "거래구분"],
  transactionTime: ["거래시간", "시간"],
  uploadedAccountTitle: ["목", "계정과목", "구분계정과목", "세목"],
  uploadedMajorCategory: ["항", "대분류", "예산분류", "업무분류"],
  withdrawalAmount: ["출금", "출금액", "출금금액", "지급액", "나간금액"],
};

const keywordRules = [
  { keywords: ["kt", "전화", "인터넷", "팩스", "통신"], subjectName: "통신비" },
  { keywords: ["송금수수료", "수수료", "타행"], subjectName: "지급수수료" },
  { keywords: ["전기", "수도", "가스"], subjectName: "수도광열비" },
  { keywords: ["사무용품", "커피", "생수", "문구"], subjectName: "사무용품비" },
  { keywords: ["토너", "복사용지", "소모품"], subjectName: "소모품비" },
  { keywords: ["식대", "식비", "간식"], subjectName: "복리후생비" },
  { keywords: ["법무", "변호사", "소송"], subjectName: "법무비" },
  { keywords: ["세무", "회계"], subjectName: "세무비" },
  { keywords: ["감정평가", "감평"], subjectName: "감정평가비" },
  { keywords: ["토지", "지주", "매매"], subjectName: "토지매입비" },
  { keywords: ["pf이자", "pf 이자", "대출이자"], subjectName: "PF이자" },
  { keywords: ["pf수수료", "pf 수수료"], subjectName: "PF수수료" },
];

export function detectBankTransactionColumns(headers: string[]): BankTransactionColumnMap {
  return headers.reduce<BankTransactionColumnMap>((result, header, index) => {
    const normalizedHeader = normalizeHeader(header);
    const matchedKey = (Object.entries(columnAliases) as Array<[keyof BankTransactionColumnMap, string[]]>).find(([, aliases]) =>
      aliases.some((alias) => normalizeHeader(alias) === normalizedHeader),
    )?.[0];

    if (matchedKey) {
      result[matchedKey] = index;
    }

    return result;
  }, {});
}

export function parseBankTransactionRows(input: ParseBankTransactionRowsInput): ParsedBankTransactionRow[] {
  const columns = detectBankTransactionColumns(input.headers);

  return input.rows
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row, index) => {
      const depositAmount = parseAmount(readCell(row, columns.depositAmount));
      const withdrawalAmount = parseAmount(readCell(row, columns.withdrawalAmount));
      const transactionKind = inferTransactionKind(readCell(row, columns.transactionKind), depositAmount, withdrawalAmount);
      const description = readCell(row, columns.description);
      const branchName = readCell(row, columns.branchName);
      const uploadedAccountTitle = readCell(row, columns.uploadedAccountTitle);
      const uploadedMajorCategory = readCell(row, columns.uploadedMajorCategory);
      const recommendation = recommendAccountSubjectForTransaction({
        accountSubjects: input.accountSubjects,
        branchName,
        description,
        transactionKind,
        uploadedAccountTitle,
        uploadedMajorCategory,
      });

      return {
        bankAccountId: input.selectedBankAccountId,
        bankAccountName: input.selectedBankAccountName,
        balanceAmount: columns.balanceAmount === undefined ? null : parseAmount(readCell(row, columns.balanceAmount)),
        branchName,
        depositAmount,
        description,
        matchStatus: recommendation.matchStatus,
        raw: buildRawRecord(input.headers, row),
        recommendedAccountSubjectId: recommendation.recommendedAccountSubjectId,
        recommendedAccountSubjectName: recommendation.recommendedAccountSubjectName,
        transactedAt: combineDateTime(readCell(row, columns.transactionDate), readCell(row, columns.transactionTime), index),
        transactionKind,
        uploadedAccountTitle,
        uploadedMajorCategory,
        withdrawalAmount,
      };
    });
}

export function recommendAccountSubjectForTransaction(input: RecommendationInput): RecommendationResult {
  if (input.uploadedAccountTitle?.trim()) {
    const uploadedMatch = findSubject(input.accountSubjects, input.uploadedAccountTitle);

    if (uploadedMatch) {
      return {
        matchStatus: "업로드분류",
        recommendedAccountSubjectId: uploadedMatch.id,
        recommendedAccountSubjectName: uploadedMatch.name,
      };
    }

    return {
      matchStatus: "신규후보",
      recommendedAccountSubjectId: null,
      recommendedAccountSubjectName: input.uploadedAccountTitle,
    };
  }

  const haystack = `${input.description} ${input.branchName}`.toLowerCase();
  const rule = keywordRules.find((candidate) => candidate.keywords.some((keyword) => haystack.includes(keyword.toLowerCase())));
  const keywordMatch = rule ? findSubject(input.accountSubjects, rule.subjectName) : null;

  if (keywordMatch) {
    return {
      matchStatus: "자동추천",
      recommendedAccountSubjectId: keywordMatch.id,
      recommendedAccountSubjectName: keywordMatch.name,
    };
  }

  if (rule) {
    return {
      matchStatus: "자동추천",
      recommendedAccountSubjectId: null,
      recommendedAccountSubjectName: rule.subjectName,
    };
  }

  return {
    matchStatus: "미분류",
    recommendedAccountSubjectId: null,
    recommendedAccountSubjectName: null,
  };
}

function normalizeHeader(value: string) {
  return value.replace(/\s/g, "").trim().toLowerCase();
}

function readCell(row: string[], index: number | undefined) {
  if (index === undefined) {
    return "";
  }

  return `${row[index] ?? ""}`.trim();
}

function parseAmount(value: string) {
  const cleaned = value.replace(/[^\d.-]/g, "");
  const parsed = Number(cleaned);

  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
}

function inferTransactionKind(value: string, depositAmount: number, withdrawalAmount: number): "입금" | "출금" {
  if (depositAmount > 0 && withdrawalAmount === 0) {
    return "입금";
  }

  if (withdrawalAmount > 0) {
    return "출금";
  }

  return value.includes("입") ? "입금" : "출금";
}

function combineDateTime(dateValue: string, timeValue: string, fallbackIndex: number) {
  const normalizedDate = dateValue.replace(/[.]/g, "/").replace(/-/g, "/").trim();
  const [year = "2026", month = "01", day = "01"] = normalizedDate.split("/").map((part) => part.padStart(2, "0"));
  const normalizedTime = timeValue.trim() || `00:${String(fallbackIndex).padStart(2, "0")}`;
  const [hour = "00", minute = "00"] = normalizedTime.split(":").map((part) => part.padStart(2, "0"));

  return `${year}-${month}-${day}T${hour}:${minute}:00.000+09:00`;
}

function buildRawRecord(headers: string[], row: string[]) {
  return headers.reduce<Record<string, string>>((result, header, index) => {
    result[header] = `${row[index] ?? ""}`;
    return result;
  }, {});
}

function findSubject(subjects: RegisteredAccountSubject[], nameOrAlias: string) {
  const normalized = normalizeComparable(nameOrAlias);

  return subjects.find((subject) => subject.isActive && (normalizeComparable(subject.name) === normalized || subject.aliases.some((alias) => normalizeComparable(alias) === normalized))) ?? null;
}

function normalizeComparable(value: string) {
  return value.replace(/\s/g, "").trim().toLowerCase();
}
