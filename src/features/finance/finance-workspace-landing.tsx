import Link from "next/link";

export type FinanceWorkspaceKey = "cash" | "receivables" | "budget" | "tax" | "services";

type WorkspaceItem = {
  description: string;
  href?: string;
  label: string;
};

type WorkspaceLanding = {
  description: string;
  items: WorkspaceItem[];
  label: string;
};

export const financeWorkspaceLandings: Record<FinanceWorkspaceKey, WorkspaceLanding> = {
  cash: {
    label: "입출금",
    description: "조합 자금의 수납과 지급 업무를 항목별로 확인합니다.",
    items: [
      { label: "조합원 분담금", description: "조합원별 부과·수납 원장 연결 상태를 확인합니다.", href: "/finance/collections" },
      { label: "토지비 지급", description: "토지비 지급 요청과 집행 내역을 관리합니다." },
      { label: "신탁계좌 관리", description: "신탁계좌의 요청·회신·집행 흐름을 확인합니다.", href: "/finance/trust?view=business" },
      { label: "업무대행비", description: "업무대행비 요청과 지급 내역을 관리합니다." },
      { label: "시공/설계/감리비", description: "사업 관련 용역비 집행 현황을 확인합니다." },
    ],
  },
  receivables: {
    label: "채권·채무",
    description: "거래처별 채권·채무 잔액과 예정 내역을 확인합니다.",
    items: [
      { label: "거래처 원장", description: "거래처별 발생·정산 내역을 조회합니다." },
      { label: "채권 잔액", description: "회수해야 할 채권 잔액을 확인합니다." },
      { label: "채무 잔액", description: "지급해야 할 채무 잔액을 확인합니다." },
      { label: "미납/연체 관리", description: "기한이 지난 미납·연체 건을 확인합니다." },
      { label: "지급 예정표", description: "예정된 지급 일정을 확인합니다." },
    ],
  },
  budget: {
    label: "예산·결산",
    description: "예산 집행과 월별 결산 현황을 한곳에서 확인합니다.",
    items: [
      { label: "예산 대비 집행", description: "편성 예산과 실제 집행액을 비교합니다.", href: "/finance/reimbursements?tab=budgets" },
      { label: "사업비 집행률", description: "사업 항목별 예산 소진율을 확인합니다.", href: "/finance/reports?section=budget" },
      { label: "월별 결산", description: "월별 전표·증빙 누락과 마감 상태를 점검합니다.", href: "/finance/month-close" },
      { label: "계정별 집계", description: "계정과목별 집행 합계를 확인합니다.", href: "/finance/reports?section=budget" },
    ],
  },
  tax: {
    label: "세무신고",
    description: "세무 신고에 필요한 증빙과 제출 자료를 준비합니다.",
    items: [
      { label: "부가세 신고", description: "부가세 신고 대상 증빙을 확인합니다." },
      { label: "원천세 신고", description: "원천세 신고에 필요한 지급 자료를 확인합니다." },
      { label: "법인세 자료", description: "법인세 검토용 회계 자료를 준비합니다." },
      { label: "전자세금계산서", description: "등록된 세금계산서·계산서 증빙을 조회합니다.", href: "/finance/tax-documents" },
      { label: "신고자료 내보내기", description: "세무사 전달용 월별 자료를 내려받습니다.", href: "/finance/tax-documents" },
    ],
  },
  services: {
    label: "부가서비스",
    description: "전자 업무와 ERP 이용 지원 기능을 확인합니다.",
    items: [
      { label: "전자계약", description: "계약 문서의 전자 작성·서명 기능을 준비 중입니다." },
      { label: "전자결재", description: "기안·결재 업무로 이동합니다.", href: "/approval/inbox" },
      { label: "도움말", description: "ERP 주요 업무별 이용 안내를 확인합니다." },
      { label: "환경설정", description: "조직별 ERP 환경 설정 기능을 준비 중입니다." },
    ],
  },
};

export function parseFinanceWorkspaceKey(value: string | undefined): FinanceWorkspaceKey | undefined {
  return value && Object.hasOwn(financeWorkspaceLandings, value) ? value as FinanceWorkspaceKey : undefined;
}

export function FinanceWorkspaceLanding({ workspaceKey }: { workspaceKey: FinanceWorkspaceKey }) {
  const workspace = financeWorkspaceLandings[workspaceKey];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-[24px] border border-[var(--color-soft-border)] bg-white p-6">
        <p className="text-sm font-bold text-[var(--color-deep-cobalt)]">회계/자금 &gt; {workspace.label}</p>
        <h1 className="mt-2 text-3xl font-bold">{workspace.label}</h1>
        <p className="mt-2 text-sm text-[var(--color-stone)]">{workspace.description}</p>
      </section>

      <section aria-label={`${workspace.label} 업무`} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workspace.items.map((item) => {
          const content = (
            <>
              <h2 className="text-lg font-bold">{item.label}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--color-stone)]">{item.description}</p>
              <p className="mt-4 text-xs font-bold text-[var(--color-deep-cobalt)]">{item.href ? "업무 열기 →" : "기능 준비 중"}</p>
            </>
          );

          return item.href ? (
            <Link className="rounded-2xl border border-[var(--color-soft-border)] bg-white p-5 transition hover:border-[var(--color-deep-cobalt)] hover:shadow-sm focus-visible:outline-2" href={item.href} key={item.label}>
              {content}
            </Link>
          ) : (
            <article className="rounded-2xl border border-[var(--color-soft-border)] bg-white p-5" key={item.label}>
              {content}
            </article>
          );
        })}
      </section>
    </div>
  );
}
