import { Download, Filter, Plus, Search } from "lucide-react";

import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import { memberFilters, members } from "./member-data";

const badgeClasses: Record<string, string> = {
  정상: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  검토중: "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
  완료: "bg-[var(--color-sprout)] text-[var(--color-green-ink)]",
  미납: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
  미비: "bg-[var(--color-sunset-soft)] text-[var(--color-tangerine)]",
  검토: "bg-[var(--color-butter-soft)] text-[var(--color-mustard)]",
  충돌: "bg-[var(--color-lilac-mist)] text-[var(--color-amethyst)]",
};

function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses[value] ?? "bg-[var(--color-cloud-veil)] text-[var(--color-stone)]"}`}>
      {value}
    </span>
  );
}

export function MemberListPage() {
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
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-2 rounded-full border border-[var(--color-soft-border)] bg-white px-4 py-2.5 text-sm text-[var(--color-fog)] xl:w-[420px]">
              <Search className="size-4 shrink-0" />
              <span>이름, 연락처, 조합원번호 검색</span>
            </div>
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
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="bg-[var(--color-cloud-veil)] text-xs font-semibold text-[var(--color-stone)]">
                <tr>
                  <th className="px-4 py-3 text-center">조합원번호</th>
                  <th className="px-4 py-3 text-center">이름</th>
                  <th className="px-4 py-3 text-center">연락처</th>
                  <th className="px-4 py-3 text-center">동/호수</th>
                  <th className="px-4 py-3 text-center">계약</th>
                  <th className="px-4 py-3 text-center">납부</th>
                  <th className="px-4 py-3 text-center">서류</th>
                  <th className="px-4 py-3 text-center">연동</th>
                  <th className="px-4 py-3 text-center">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-soft-border)]">
                {members.map((member) => (
                  <tr className="bg-white/70" key={member.id}>
                    <td className="px-4 py-4 font-semibold">{member.memberNo}</td>
                    <td className="px-4 py-4">{member.name}</td>
                    <td className="px-4 py-4 text-[var(--color-stone)]">{member.phone}</td>
                    <td className="px-4 py-4 text-[var(--color-stone)]">{member.unit}</td>
                    <td className="px-4 py-4">
                      <StatusBadge value={member.contractStatus} />
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge value={member.paymentStatus} />
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge value={member.documentStatus} />
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge value={member.integrationStatus} />
                    </td>
                    <td className="px-4 py-4 text-right">
                      <a className="font-semibold text-[var(--color-deep-cobalt)]" href={`/members/${member.id}`}>
                        보기
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </ErpShell>
  );
}
