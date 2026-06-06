import {
  BarChart3,
  Bell,
  Building2,
  CalendarCheck,
  FileText,
  Home,
  Landmark,
  Map,
  Search,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";

const navigation = [
  { label: "대시보드", icon: Home, href: "/", active: true },
  { label: "조합원", icon: Users, href: "/members" },
  { label: "회계/자금", icon: Wallet, href: "#" },
  { label: "총회", icon: CalendarCheck, href: "#" },
  { label: "토지", icon: Map, href: "#" },
  { label: "수지분석", icon: BarChart3, href: "#" },
  { label: "문서/공지", icon: FileText, href: "#" },
  { label: "연동", icon: Landmark, href: "#" },
  { label: "설정", icon: Settings, href: "#" },
];

type ErpShellProps = {
  children: ReactNode;
};

export function ErpShell({ children }: ErpShellProps) {
  return (
    <div className="min-h-screen bg-[var(--color-sky-wash)] text-[var(--color-midnight-ink)]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-[var(--color-soft-border)] bg-[var(--color-paper-white)]/92 px-4 py-5 backdrop-blur xl:block">
        <div className="mb-7 flex items-center gap-3 px-2">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-[var(--color-pressed-charcoal)] text-white">
            <Building2 className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Daebang ERP</p>
            <p className="text-xs text-[var(--color-stone)]">지역주택조합 통합관리</p>
          </div>
        </div>

        <nav className="space-y-1">
          {navigation.map((item) => (
            <a
              aria-current={item.active ? "page" : undefined}
              className={
                item.active
                  ? "flex items-center gap-3 rounded-xl bg-[var(--color-morning-tint)] px-3 py-2.5 text-sm font-semibold text-[var(--color-midnight-ink)]"
                  : "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-stone)] transition hover:bg-white hover:text-[var(--color-midnight-ink)]"
              }
              href={item.href}
              key={item.label}
            >
              <item.icon className="size-4" />
              {item.label}
            </a>
          ))}
        </nav>
      </aside>

      <div className="xl:pl-64">
        <header className="sticky top-0 z-10 border-b border-[var(--color-soft-border)] bg-[var(--color-sky-wash)]/86 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <div className="hidden rounded-full border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] px-3 py-1.5 text-sm font-semibold sm:block">
                대방동 지역주택조합
              </div>
              <div className="flex min-w-0 items-center gap-2 rounded-full border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] px-3 py-2 text-sm text-[var(--color-fog)]">
                <Search className="size-4 shrink-0" />
                <span className="truncate">조합원, 필지, 문서 검색</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                aria-label="알림"
                className="flex size-9 items-center justify-center rounded-full border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] text-[var(--color-stone)]"
                type="button"
              >
                <Bell className="size-4" />
              </button>
              <div className="rounded-full bg-[var(--color-pressed-charcoal)] px-4 py-2 text-sm font-semibold text-white">
                관리자
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
