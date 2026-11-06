import Link from "next/link";
import type { ReactNode } from "react";

type FinancePageHeaderProps = {
  action?: { href: string; label: string };
  breadcrumb: ReactNode;
  description: string;
  title: string;
};

export function FinancePageHeader({ action, breadcrumb, description, title }: FinancePageHeaderProps) {
  return (
    <header className="rounded-xl border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] px-4 py-4 sm:px-5">
      <p className="text-xs font-semibold text-[var(--color-deep-cobalt)]">{breadcrumb}</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-normal">{title}</h1>
          <p className="mt-1 text-sm leading-6 text-[var(--color-stone)]">{description}</p>
        </div>
        {action ? (
          <Link
            className="inline-flex min-h-11 items-center rounded-lg bg-[var(--color-pressed-charcoal)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-deep-cobalt)] focus-visible:outline-2 focus-visible:outline-offset-2"
            href={action.href}
          >
            {action.label}
          </Link>
        ) : null}
      </div>
    </header>
  );
}

export type FinanceStatusTab = {
  active: boolean;
  count: number;
  href: string;
  label: string;
};

export function FinanceStatusTabs({ items, label }: { items: FinanceStatusTab[]; label: string }) {
  return (
    <nav aria-label={label} className="overflow-x-auto border-b border-[var(--color-soft-border)] bg-white">
      <div className="flex min-w-max items-center px-3">
        {items.map((item) => (
          <Link
            aria-current={item.active ? "page" : undefined}
            className={`flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[var(--color-deep-cobalt)] ${item.active ? "border-[var(--color-deep-cobalt)] text-[var(--color-deep-cobalt)]" : "border-transparent text-[var(--color-stone)] hover:text-[var(--color-midnight-ink)]"}`}
            href={item.href}
            key={item.label}
          >
            <span>{item.label}</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[11px] ${item.active ? "bg-[var(--color-morning-tint)]" : "bg-[var(--color-cloud-veil)]"}`}>
              {item.count.toLocaleString("ko-KR")}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function FinanceToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-16 z-[6] border-b border-[var(--color-soft-border)] bg-white/95 px-3 py-3 backdrop-blur">
      {children}
    </div>
  );
}

export function FinanceDataTable({ children, minWidthClass = "min-w-[900px]" }: { children: ReactNode; minWidthClass?: string }) {
  return (
    <div className="max-h-[65vh] min-h-[360px] overflow-auto">
      <table className={`w-full border-collapse text-left text-sm ${minWidthClass}`}>{children}</table>
    </div>
  );
}

type FinancePaginationProps = {
  compact?: boolean;
  hrefForPage: (page: number) => string;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export function FinancePagination({ compact = false, hrefForPage, page, pageSize, totalCount, totalPages }: FinancePaginationProps) {
  const from = totalCount ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, totalCount);
  const linkClass = compact
    ? "rounded-md border border-[var(--color-soft-border)] bg-white px-2.5 py-1.5 text-xs font-semibold"
    : "rounded-lg border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm font-semibold";
  const disabledClass = `${linkClass} pointer-events-none text-[var(--color-stone)] opacity-40`;

  return (
    <nav aria-label="은행 거래내역 페이지 이동" className={`flex items-center justify-between gap-2 ${compact ? "text-xs" : "text-sm"}`}>
      {page > 1 ? <Link className={linkClass} href={hrefForPage(page - 1)}>이전</Link> : <span className={disabledClass}>이전</span>}
      <span className="whitespace-nowrap font-semibold text-[var(--color-stone)]">
        {totalCount ? `${from}–${to}건 · ${page}/${totalPages}` : "표시할 거래 없음"}
      </span>
      {page < totalPages ? <Link className={linkClass} href={hrefForPage(page + 1)}>다음</Link> : <span className={disabledClass}>다음</span>}
    </nav>
  );
}
