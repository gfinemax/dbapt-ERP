import { Download, Filter, Plus, Search } from "lucide-react";

import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import { memberFilters, members, type Member } from "./member-data";
import type { PeopleOnMembersPagination, PeopleOnMembersTableParams } from "@/lib/peopleon/members-table";

const badgeClasses: Record<string, string> = {
  정상: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  검토중: "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
  완료: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  미납: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
  미비: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
  검토: "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
  충돌: "bg-[var(--color-lilac-mist)] text-[var(--color-amethyst)]",
};

const headerCellClass = "whitespace-nowrap px-4 py-3 text-center";
const bodyCellClass = "whitespace-nowrap px-4 py-4";

function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses[value] ?? "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]"}`}>
      {value}
    </span>
  );
}

function splitMultiValue(value: string) {
  const values = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return values.length > 0 ? values : ["-"];
}

function MultiValueCell({ className = "", value }: { className?: string; value: string }) {
  return (
    <td className={`${bodyCellClass} ${className}`}>
      <div className="flex flex-col gap-1">
        {splitMultiValue(value).map((item, index) => (
          <span className="whitespace-nowrap" key={`${item}-${index}`}>
            {item}
          </span>
        ))}
      </div>
    </td>
  );
}

type MemberListPageProps = {
  initialMembers?: Member[];
  pagination?: PeopleOnMembersPagination;
  query?: PeopleOnMembersTableParams;
};

const memberTierTabs = ["등기조합원", "예비조합원", "권리증보유자"];

function readQueryStringValue(query: PeopleOnMembersTableParams | undefined, key: string, fallback = "") {
  const value = query?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? fallback;
  }

  return value ?? fallback;
}

function buildMembersPageHref(query: PeopleOnMembersTableParams | undefined, page: number) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query ?? {})) {
    if (key === "page") continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) params.append(key, item);
      }
      continue;
    }

    if (value) {
      params.set(key, value);
    }
  }

  params.set("page", String(page));

  return `/members?${params.toString()}`;
}

function buildMembersTierHref(query: PeopleOnMembersTableParams | undefined, tier: string) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query ?? {})) {
    if (key === "page" || key === "tier") continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) params.append(key, item);
      }
      continue;
    }

    if (value) {
      params.set(key, value);
    }
  }

  params.set("tier", tier);
  params.set("page", "1");

  return `/members?${params.toString()}`;
}

function MemberTierTabs({ query }: { query?: PeopleOnMembersTableParams }) {
  const selectedTier = readQueryStringValue(query, "tier", "등기조합원");

  return (
    <nav aria-label="조합원 유형" className="flex flex-nowrap gap-2 overflow-x-auto">
      {memberTierTabs.map((tier) => {
        const isSelected = tier === selectedTier;

        return (
          <a
            aria-current={isSelected ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-2 text-sm font-semibold ${isSelected ? "border-[var(--color-pressed-charcoal)] bg-[var(--color-pressed-charcoal)] text-white" : "border-[var(--color-soft-border)] bg-white text-[var(--color-stone)]"}`}
            href={buildMembersTierHref(query, tier)}
            key={tier}
          >
            {tier}
          </a>
        );
      })}
    </nav>
  );
}

function MemberPagination({ pagination, query }: { pagination: PeopleOnMembersPagination; query?: PeopleOnMembersTableParams }) {
  const start = pagination.totalCount === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const end = Math.min(pagination.page * pagination.pageSize, pagination.totalCount);

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--color-soft-border)] bg-white px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2 text-[var(--color-stone)]">
        <span className="font-semibold text-[var(--color-midnight-ink)]">전체 {pagination.totalCount.toLocaleString()}명</span>
        <span>{start.toLocaleString()}-{end.toLocaleString()} 표시</span>
        <span>
          {pagination.page} / {pagination.totalPages} 페이지
        </span>
      </div>
      <div className="flex items-center gap-2">
        {pagination.hasPrevious ? (
          <a className="rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2 font-semibold text-[var(--color-stone)]" href={buildMembersPageHref(query, pagination.page - 1)}>
            이전
          </a>
        ) : (
          <button className="rounded-full border border-[var(--color-soft-border)] bg-[var(--color-cloud-veil)] px-4 py-2 font-semibold text-[var(--color-fog)]" disabled type="button">
            이전
          </button>
        )}
        {pagination.hasNext ? (
          <a className="rounded-full bg-[var(--color-pressed-charcoal)] px-4 py-2 font-semibold text-white" href={buildMembersPageHref(query, pagination.page + 1)}>
            다음
          </a>
        ) : (
          <button className="rounded-full bg-[var(--color-cloud-veil)] px-4 py-2 font-semibold text-[var(--color-fog)]" disabled type="button">
            다음
          </button>
        )}
      </div>
    </div>
  );
}

export function MemberListPage({ initialMembers = members, pagination, query }: MemberListPageProps) {
  return (
    <ErpShell activeLabel="조합원관리">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6">
        <section className="flex flex-col gap-4 rounded-[28px] border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 lg:flex-row lg:items-end lg:justify-between lg:p-7">
          <div>
            <p className="mb-3 inline-flex rounded-full bg-[var(--color-morning-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]">
              peopleON 연동 원장
            </p>
            <h1 className="text-3xl font-bold tracking-normal">조합원관리</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--color-stone)]">
              조합원 원장, 계약 상태, 납부 상태, 서류 상태를 한 화면에서 확인합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="rounded-full" size="lg" variant="outline">
              <Download className="size-4" />
              엑셀 내보내기
            </Button>
            <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" size="lg">
              <Plus className="size-4" />
              조합원 추가
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-2 rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2.5 text-sm text-[var(--color-fog)] lg:w-[420px]">
              <Search className="size-4 shrink-0" />
              <span>이름, 연락처, 조합원번호 검색</span>
            </div>
            <MemberTierTabs query={query} />
          </div>
          <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {memberFilters.map((filter) => (
                <button
                  className="rounded-full border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--color-stone)] first:bg-[var(--color-pressed-charcoal)] first:text-white"
                  key={filter}
                  type="button"
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2 rounded-xl bg-[var(--color-cloud-veil)] px-4 py-3 text-sm text-[var(--color-stone)]">
            <Filter className="size-4" />
            동/호수 · 계약상태 · 납부상태 · 서류상태 · 연동상태 필터 예정
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] border-collapse text-left text-sm">
              <thead className="bg-[var(--color-cloud-veil)] text-xs font-semibold text-[var(--color-stone)]">
                <tr>
                  <th className={headerCellClass}>조합원번호</th>
                  <th className={headerCellClass}>이름</th>
                  <th className={headerCellClass}>연락처</th>
                  <th className={headerCellClass}>동/호수</th>
                  <th className={headerCellClass}>계약</th>
                  <th className={headerCellClass}>납부</th>
                  <th className={headerCellClass}>서류</th>
                  <th className={headerCellClass}>연동</th>
                  <th className={headerCellClass}>작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-soft-border)]">
                {initialMembers.map((member) => (
                  <tr className="bg-white/70" key={member.id}>
                    <MultiValueCell className="font-semibold" value={member.memberNo} />
                    <td className={bodyCellClass}>{member.name}</td>
                    <MultiValueCell className="text-[var(--color-stone)]" value={member.phone} />
                    <td className={`${bodyCellClass} text-[var(--color-stone)]`}>{member.unit}</td>
                    <td className={bodyCellClass}>
                      <StatusBadge value={member.contractStatus} />
                    </td>
                    <td className={bodyCellClass}>
                      <StatusBadge value={member.paymentStatus} />
                    </td>
                    <td className={bodyCellClass}>
                      <StatusBadge value={member.documentStatus} />
                    </td>
                    <td className={bodyCellClass}>
                      <StatusBadge value={member.integrationStatus} />
                    </td>
                    <td className={`${bodyCellClass} text-right`}>
                      <a className="whitespace-nowrap font-semibold text-[var(--color-deep-cobalt)]" href={`/members/${member.id}`}>
                        보기
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagination ? <MemberPagination pagination={pagination} query={query} /> : null}
        </section>
      </div>
    </ErpShell>
  );
}
