import { FilePlus2, MessageSquareText, Pencil } from "lucide-react";

import { ErpShell } from "@/components/erp-shell";
import { Button } from "@/components/ui/button";
import { findMemberById } from "./member-data";

const tabs = ["기본 정보", "계약/권리", "납부", "문서", "상담/민원", "변경 이력"];

type MemberDetailPageProps = {
  memberId: string;
};

export function MemberDetailPage({ memberId }: MemberDetailPageProps) {
  const member = findMemberById(memberId) ?? findMemberById("m-000124");

  if (!member) {
    return null;
  }

  return (
    <ErpShell>
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6">
        <section className="flex flex-col gap-4 rounded-[28px] border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5 lg:flex-row lg:items-end lg:justify-between lg:p-7">
          <div>
            <p className="mb-3 inline-flex rounded-full bg-[var(--color-morning-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-deep-cobalt)]">
              {member.status} 조합원 · peopleON 연동 {member.integrationStatus}
            </p>
            <h1 className="text-3xl font-bold tracking-normal">
              {member.name} / {member.memberNo}
            </h1>
            <p className="mt-3 text-base leading-7 text-[var(--color-stone)]">
              {member.memo}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="rounded-full" size="lg" variant="outline">
              <FilePlus2 className="size-4" />
              문서 추가
            </Button>
            <Button className="rounded-full" size="lg" variant="outline">
              <MessageSquareText className="size-4" />
              상담
            </Button>
            <Button className="rounded-full bg-[var(--color-pressed-charcoal)] px-5 text-white hover:bg-[var(--color-midnight-ink)]" size="lg">
              <Pencil className="size-4" />
              수정
            </Button>
          </div>
        </section>

        <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-2">
          {tabs.map((tab) => (
            <button
              className="shrink-0 rounded-xl px-4 py-2 text-sm font-semibold text-[var(--color-stone)] first:bg-[var(--color-pressed-charcoal)] first:text-white"
              key={tab}
              type="button"
            >
              {tab}
            </button>
          ))}
        </nav>

        <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
            <h2 className="text-xl font-bold">기본 정보</h2>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <Info label="이름" value={member.name} />
              <Info label="연락처" value={member.phone} />
              <Info label="주소" value={member.address} />
              <Info label="가입일" value={member.joinedAt} />
              <Info label="조합원번호" value={member.memberNo} />
              <Info label="세대" value={member.unit} />
            </dl>
          </div>

          <aside className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
            <h2 className="text-xl font-bold">요약</h2>
            <div className="mt-5 space-y-3">
              <Summary label="계약상태" value={member.contractStatus} />
              <Summary label="납부상태" value={member.paymentStatus} />
              <Summary label="서류상태" value={member.documentStatus} />
              <Summary label="연동상태" value={member.integrationStatus} />
            </div>
          </aside>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
            <h2 className="text-xl font-bold">최근 납부</h2>
            <div className="mt-5 rounded-xl bg-white p-4">
              <p className="text-sm font-semibold">{member.recentPayment.label}</p>
              <p className="mt-2 text-2xl font-bold">{member.recentPayment.amount}</p>
              <p className="mt-1 text-sm text-[var(--color-stone)]">
                처리일: {member.recentPayment.paidAt}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] p-5">
            <h2 className="text-xl font-bold">최근 문서</h2>
            <div className="mt-5 rounded-xl bg-white p-4">
              <p className="text-sm font-semibold">{member.recentDocument.label}</p>
              <p className="mt-2 text-2xl font-bold">{member.recentDocument.status}</p>
              <p className="mt-1 text-sm text-[var(--color-stone)]">
                문서함과 조합원 원장에 연결됩니다.
              </p>
            </div>
          </div>
        </section>
      </div>
    </ErpShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-4">
      <dt className="text-xs font-semibold text-[var(--color-fog)]">{label}</dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3">
      <span className="text-sm text-[var(--color-stone)]">{label}</span>
      <span className="text-sm font-bold">{value}</span>
    </div>
  );
}
