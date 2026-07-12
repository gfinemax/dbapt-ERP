"use client";

import {
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileCheck2,
  FileText,
  Home,
  LogOut,
  Map,
  ReceiptText,
  Search,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

const primaryNavigation = [
  { label: "대시보드", icon: Home, href: "/" },
  { label: "조합원", icon: Users, href: "/members" },
  { label: "회계/자금", icon: Wallet, href: "/finance/expense-resolutions" },
  { label: "총회", icon: CalendarCheck, href: "#" },
  { label: "토지", icon: Map, href: "#" },
  { label: "계약/분양", icon: FileCheck2, href: "#" },
  { label: "수지분석", icon: BarChart3, href: "#" },
  { label: "문서/공지", icon: FileText, href: "#" },
  { label: "연동", icon: CreditCard, href: "#" },
  { label: "설정", icon: Settings, href: "#" },
];

type DetailMenuItem = {
  href?: string;
  label: string;
};

type WorkspaceMenu = {
  defaultDetailLabel?: string;
  href: string;
  items: DetailMenuItem[];
  label: string;
};

const workspaceMenus: Record<string, WorkspaceMenu[]> = {
  "회계/자금": [
    {
      defaultDetailLabel: "거래처등록",
      href: "/basic-info",
      label: "기초정보",
      items: [
        { label: "거래처등록", href: "/basic-info?section=partners" },
        { label: "품목등록", href: "/basic-info?section=items" },
        { label: "은행통장 등록", href: "/basic-info?section=bank-accounts" },
        { label: "신용카드 등록", href: "/basic-info?section=cards" },
        { label: "계정과목 등록", href: "/basic-info?section=account-subjects" },
        { label: "초기잔액 등록" },
      ],
    },
    {
      defaultDetailLabel: "지출결의서 관리",
      href: "/finance/expense-resolutions",
      label: "전표·증빙관리",
      items: [
        { label: "지출결의서 관리", href: "/finance/expense-resolutions" },
        { label: "수입·지출 전표관리", href: "/finance" },
        { label: "결재함", href: "/finance/approval-inbox" },
        { label: "지급대기", href: "/finance/payment-waiting" },
        { label: "지급완료 내역", href: "/finance/payment-completed" },
        { label: "분담금 수납관리" },
        { label: "환불금 지급관리" },
        { label: "증빙자료 관리" },
        { label: "세금계산서·계산서" },
        { label: "계좌거래 매칭" },
        { label: "예산집행 현황" },
      ],
    },
    {
      href: "/finance",
      label: "입출금",
      items: [
        { label: "조합원 분담금" },
        { label: "토지비 지급" },
        { label: "신탁계좌 관리" },
        { label: "업무대행비" },
        { label: "시공/설계/감리비" },
      ],
    },
    {
      href: "/finance",
      label: "채권·채무",
      items: [
        { label: "거래처 원장" },
        { label: "채권 잔액" },
        { label: "채무 잔액" },
        { label: "미납/연체 관리" },
        { label: "지급 예정표" },
      ],
    },
    {
      href: "/finance",
      label: "예산·결산",
      items: [
        { label: "예산 대비 집행" },
        { label: "사업비 집행률" },
        { label: "월별 결산" },
        { label: "계정별 집계" },
      ],
    },
    {
      href: "/finance",
      label: "은행·카드",
      items: [
        { label: "은행 거래내역", href: "/finance/bank-transactions" },
        { label: "카드 사용내역" },
        { label: "계좌 연동 설정" },
        { label: "카드 연동 설정" },
        { label: "전표 자동매칭" },
        { label: "미매칭 내역" },
      ],
    },
    {
      defaultDetailLabel: "사원정보등록",
      href: "/hr-payroll",
      label: "인사·급여",
      items: [
        { label: "사원정보등록", href: "/hr-payroll?section=employees" },
        { label: "급여입력", href: "/hr-payroll?section=payroll-entry" },
        { label: "급여대장", href: "/hr-payroll?section=payroll-ledger" },
        { label: "급여명세" },
        { label: "급여이체" },
        { label: "근로소득 원천징수영수증" },
        { label: "4대보험" },
        { label: "퇴직금 정산" },
      ],
    },
    {
      href: "/finance",
      label: "세무신고",
      items: [
        { label: "부가세 신고" },
        { label: "원천세 신고" },
        { label: "법인세 자료" },
        { label: "전자세금계산서" },
        { label: "신고자료 내보내기" },
      ],
    },
    {
      href: "/finance",
      label: "부가서비스",
      items: [
        { label: "전자계약" },
        { label: "전자결재" },
        { label: "도움말" },
        { label: "환경설정" },
      ],
    },
    {
      defaultDetailLabel: "보고서 목록",
      href: "/finance/reports",
      label: "보고서",
      items: [
        { label: "보고서 목록", href: "/finance/reports" },
        { label: "실적보고서", href: "/finance/reports?section=performance" },
        { label: "자금입출금명세서", href: "/finance/reports?section=cash-flow" },
        { label: "운영비 예산", href: "/finance/reports?section=budget" },
      ],
    },
  ],
};

const defaultWorkspaceLabels: Record<string, string> = {
  "회계/자금": "전표·증빙관리",
};

const quickMenus = ["조합원 등록", "분담금 수납처리", "은행거래 업로드", "카드내역", "지출결의 작성", "지급대기", "증빙 미첨부", "미납 조합원"];

function normalizeActiveLabel(activeLabel: string) {
  if (activeLabel === "조합원관리") {
    return "조합원";
  }

  if (activeLabel === "총회/의결") {
    return "총회";
  }

  if (activeLabel === "토지관리") {
    return "토지";
  }

  return activeLabel;
}

type ErpShellProps = {
  activeDetailLabel?: string;
  activeLabel?: string;
  activeWorkspaceLabel?: string;
  children: ReactNode;
  onQuickMenuSelect?: (label: string) => void;
};

export function ErpShell({ activeDetailLabel, activeLabel = "대시보드", activeWorkspaceLabel, children, onQuickMenuSelect }: ErpShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const sidebarToggleLabel = isSidebarOpen ? "사이드바 닫기" : "사이드바 열기";
  const sidebarToggleText = isSidebarOpen ? "닫기" : "메뉴";
  const sidebarToggleLetters = Array.from(sidebarToggleText);
  const SidebarToggleIcon = isSidebarOpen ? ChevronLeft : ChevronRight;
  const selectedMenu = normalizeActiveLabel(activeLabel);
  const currentWorkspaceMenus = workspaceMenus[selectedMenu] ?? [];
  const selectedWorkspaceLabel = activeWorkspaceLabel ?? defaultWorkspaceLabels[selectedMenu] ?? currentWorkspaceMenus[0]?.label;
  const selectedWorkspace = currentWorkspaceMenus.find((workspace) => workspace.label === selectedWorkspaceLabel) ?? currentWorkspaceMenus[0];
  const currentDetailMenus = selectedWorkspace?.items ?? [];
  const hasDetailMenus = currentDetailMenus.length > 0;
  const [fullMenuFor, setFullMenuFor] = useState<string | null>(null);
  const isDetailMode = hasDetailMenus && fullMenuFor !== selectedMenu;
  const selectedDetailMenu = activeDetailLabel ?? selectedWorkspace?.defaultDetailLabel ?? currentDetailMenus[0]?.label;

  return (
    <div className="min-h-screen bg-[var(--color-sky-wash)] text-[var(--color-midnight-ink)]">
      <aside
        aria-label="사이드바"
        className={`fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-[var(--color-soft-border)] bg-[var(--color-paper-white)]/92 px-4 py-5 backdrop-blur transition-transform duration-300 ease-out md:block ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className={`px-2 ${isDetailMode && hasDetailMenus ? "mb-5" : "mb-7"}`}>
          {isDetailMode && hasDetailMenus ? (
            <button
              aria-label="전체 메뉴로 돌아가기"
              className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-[var(--color-morning-tint)]"
              onClick={() => setFullMenuFor(selectedMenu)}
              title="전체 메뉴로 돌아가기"
              type="button"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-pressed-charcoal)] text-white">
                <Building2 className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Daebang ERP</p>
                <p className="text-xs text-[var(--color-stone)]">지역주택조합 통합관리</p>
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--color-pressed-charcoal)] text-white">
                <Building2 className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Daebang ERP</p>
                <p className="text-xs text-[var(--color-stone)]">지역주택조합 통합관리</p>
              </div>
            </div>
          )}
        </div>

        {isDetailMode && hasDetailMenus ? (
          <div className="mb-6 flex items-center gap-3 px-2">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--color-pressed-charcoal)] text-white">
              <ReceiptText className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">{selectedMenu}</p>
              <p className="text-xs text-[var(--color-stone)]">{selectedWorkspace?.label ?? "상세 업무 메뉴"}</p>
            </div>
          </div>
        ) : null}

        {isDetailMode && hasDetailMenus ? (
          <nav aria-label={`${selectedMenu} 상세 메뉴`} className="space-y-1">
            <p className="mb-2 px-2 text-xs font-bold text-[var(--color-fog)]">해당 업무 상세 메뉴</p>
            {currentDetailMenus.map((item) => {
              const isActive = item.label === selectedDetailMenu;

              return (
                <a
                  aria-current={isActive ? "page" : undefined}
                  className={
                    isActive
                      ? "flex items-center gap-2 rounded-lg bg-[var(--color-morning-tint)] px-3 py-2 text-sm font-semibold text-[var(--color-midnight-ink)]"
                      : "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-stone)] transition hover:bg-white hover:text-[var(--color-midnight-ink)]"
                  }
                  href={item.href ?? "#"}
                  key={item.label}
                >
                  <ReceiptText className="size-3.5 shrink-0" />
                  {item.label}
                </a>
              );
            })}
          </nav>
        ) : (
          <nav aria-label="전체 메뉴" className="space-y-1">
            <p className="mb-2 px-2 text-xs font-bold text-[var(--color-fog)]">전체 메뉴</p>
            {primaryNavigation.map((item) => {
              const isActive = item.label === selectedMenu;

              return (
                <a
                  aria-current={isActive ? "page" : undefined}
                  className={
                    isActive
                      ? "flex items-center gap-2 rounded-lg bg-[var(--color-morning-tint)] px-3 py-2 text-sm font-semibold text-[var(--color-midnight-ink)]"
                      : "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-stone)] transition hover:bg-white hover:text-[var(--color-midnight-ink)]"
                  }
                  href={item.href}
                  key={item.label}
                >
                  <item.icon className="size-3.5 shrink-0" />
                  {item.label}
                </a>
              );
            })}
          </nav>
        )}

        <div className="mt-6 border-t border-[var(--color-soft-border)] pt-4">
          <div className="mb-2 flex items-center justify-between px-2">
            <p className="text-xs font-bold text-[var(--color-fog)]">퀵메뉴</p>
            <Settings className="size-3.5 text-[var(--color-fog)]" />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {quickMenus.map((item) => (
              <button
                aria-label={`퀵메뉴 ${item}`}
                className="min-h-9 rounded-md border border-[var(--color-soft-border)] bg-white px-2 text-left text-[11px] font-semibold text-[var(--color-stone)] transition hover:border-[var(--color-deep-cobalt)] hover:text-[var(--color-deep-cobalt)]"
                key={item}
                onClick={() => onQuickMenuSelect?.(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <button
        aria-label={sidebarToggleLabel}
        aria-pressed={!isSidebarOpen}
        className={`fixed top-1/2 z-30 hidden h-36 w-9 -translate-y-1/2 flex-col items-center justify-center gap-2 rounded-r-md border border-l-0 border-[rgba(16,20,24,0.16)] bg-[#8BEA00] text-[#101418] shadow-[0_8px_20px_rgba(16,20,24,0.18)] transition-[left,background-color] duration-300 ease-out hover:bg-[#6FD100] md:flex ${
          isSidebarOpen ? "left-64" : "left-0"
        }`}
        onClick={() => setIsSidebarOpen((current) => !current)}
        type="button"
      >
        <SidebarToggleIcon className="size-4 shrink-0 stroke-[3]" />
        <span className="flex flex-col items-center gap-1.5 text-xs font-black tracking-normal">
          {sidebarToggleLetters.map((letter) => (
            <span key={letter}>{letter}</span>
          ))}
        </span>
      </button>

      <div className={`transition-[padding] duration-300 ease-out ${isSidebarOpen ? "md:pl-64" : "md:pl-0"}`}>
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
              <a className="hidden items-center gap-1.5 rounded-full border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] px-3 py-2 text-sm font-semibold text-[var(--color-stone)] lg:flex" href="#">
                <BookOpen className="size-4" />
                도움말
              </a>
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
              <a aria-label="로그아웃" className="hidden size-9 items-center justify-center rounded-full border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] text-[var(--color-stone)] lg:flex" href="#">
                <LogOut className="size-4" />
              </a>
            </div>
          </div>

          {currentWorkspaceMenus.length > 0 ? (
            <div className="border-t border-[var(--color-soft-border)] bg-[var(--color-paper-white)]/74 px-4 py-2 sm:px-6 lg:px-8">
              <nav aria-label={`${selectedMenu} 업무 탭`} className="flex items-center gap-2 overflow-x-auto">
                {currentWorkspaceMenus.map((workspace) => {
                  const isActive = workspace.label === selectedWorkspace?.label;

                  return (
                    <a
                      aria-current={isActive ? "page" : undefined}
                      className={
                        isActive
                          ? "flex shrink-0 items-center gap-2 rounded-md bg-[var(--color-pressed-charcoal)] px-3 py-2 text-xs font-bold text-white"
                          : "flex shrink-0 items-center gap-2 rounded-md border border-[var(--color-soft-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-stone)] transition hover:border-[var(--color-deep-cobalt)] hover:text-[var(--color-deep-cobalt)]"
                      }
                      href={workspace.href}
                      key={workspace.label}
                    >
                      {workspace.label}
                    </a>
                  );
                })}
              </nav>
            </div>
          ) : null}
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
