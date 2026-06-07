import type { Member } from "@/features/members/member-data";

export type PeopleOnMembersTableParams = Record<string, string | string[] | undefined>;

export type PeopleOnMembersTableResponse = {
  filters?: unknown;
  pagination?: unknown;
  rows: Member[];
};

type PeopleOnFetchResponse = Pick<Response, "json" | "ok" | "status">;
type Fetcher = (input: string, init?: RequestInit) => Promise<PeopleOnFetchResponse>;

type PeopleOnClientOptions = {
  env?: Record<string, string | undefined>;
  fetcher?: Fetcher;
};

type PeopleOnMemberRow = Record<string, unknown>;

const DEFAULT_MEMBERS_TABLE_URL = "http://localhost:3001/api/members/table";
const passthroughParams = ["q", "page", "pageSize", "sort", "order", "role", "tier", "status", "rel", "tag"];

function readString(row: PeopleOnMemberRow, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim()) {
      return value;
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  return fallback;
}

function readStatus<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function mapPeopleOnMemberRow(row: PeopleOnMemberRow): Member {
  const memberNo = readString(row, ["memberNo", "member_no", "memberNumber", "member_number", "certificate_display", "code"], "미지정");
  const name = readString(row, ["name", "memberName", "member_name"], "이름 미지정");
  const paymentStatus = readStatus(readString(row, ["paymentStatus", "payment_status", "payment"]), ["완료", "미납", "연체"], "미납");
  const documentStatus = readStatus(readString(row, ["documentStatus", "document_status", "document"]), ["완료", "미비", "검토"], "검토");
  const contractStatus = readStatus(readString(row, ["contractStatus", "contract_status", "contract"]), ["정상", "검토"], "검토");

  return {
    address: readString(row, ["address", "address_legal", "addr"], "주소 미지정"),
    contractStatus,
    documentStatus,
    id: readString(row, ["id", "memberId", "member_id"], memberNo),
    integrationStatus: readStatus(readString(row, ["integrationStatus", "integration_status", "rel"]), ["정상", "충돌"], "정상"),
    joinedAt: readString(row, ["joinedAt", "joined_at", "joinDate", "join_date"], "-"),
    memberNo,
    memo: readString(row, ["memo", "note"], "peopleON API에서 조회한 조합원입니다."),
    name,
    paymentStatus,
    phone: readString(row, ["phone", "mobile", "contact", "tel"], "-"),
    recentDocument: {
      label: readString(row, ["recentDocumentLabel", "recent_document_label"], "최근 서류"),
      status: documentStatus,
    },
    recentPayment: {
      amount: readString(row, ["recentPaymentAmount", "recent_payment_amount"], "-"),
      label: readString(row, ["recentPaymentLabel", "recent_payment_label"], "최근 납부"),
      paidAt: readString(row, ["recentPaymentPaidAt", "recent_payment_paid_at"], "-"),
    },
    status: readStatus(readString(row, ["status", "memberStatus", "member_status"]), ["정상", "검토중", "탈퇴/승계"], "정상"),
    unit: readString(row, ["unit", "unit_group", "dongHo", "dong_ho", "household", "room"], "배정전"),
  };
}

function buildPeopleOnUrl(baseUrl: string, params: PeopleOnMembersTableParams) {
  const url = new URL(baseUrl);

  for (const key of passthroughParams) {
    const value = params[key];

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) url.searchParams.append(key, item);
      }
      continue;
    }

    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

export async function fetchPeopleOnMembersTable(
  params: PeopleOnMembersTableParams = {},
  options: PeopleOnClientOptions = {},
): Promise<PeopleOnMembersTableResponse | null> {
  const env = options.env ?? process.env;
  const apiKey = env.PEOPLEON_MEMBERS_API_KEY ?? env.PEOPLEON_API_KEY;

  if (!apiKey) {
    return null;
  }

  const fetcher: Fetcher = options.fetcher ?? fetch;
  const url = buildPeopleOnUrl(env.PEOPLEON_MEMBERS_TABLE_URL ?? DEFAULT_MEMBERS_TABLE_URL, params);
  const response = await fetcher(url, {
    cache: "no-store",
    headers: {
      "X-API-Key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`peopleON members table API failed: ${response.status}`);
  }

  const payload = await response.json();
  const rows = Array.isArray(payload?.rows) ? payload.rows.map(mapPeopleOnMemberRow) : [];

  return {
    filters: payload?.filters,
    pagination: payload?.pagination,
    rows,
  };
}
