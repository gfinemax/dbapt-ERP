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
  FilePenLine,
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
import { Fragment, useEffect, useState } from "react";
import { ErpQuickMenu } from "./erp-quick-menu";
import { financeNavigation, normalizeFinanceDetailLabel } from "@/features/finance/finance-navigation";
import { loadFinanceNavigationBadgesAction } from "@/app/finance/navigation/actions";

const primaryNavigation = [
  { label: "대시보드", icon: Home, href: "/" },
  { label: "기안·결재", icon: FilePenLine, href: "/approval/inbox" },
  { label: "회계/자금", icon: Wallet, href: "/finance/workspace" },
  { label: "조합원", icon: Users, href: "/members" },
  { label: "총회", icon: CalendarCheck, href: "#" },
  { label: "토지", icon: Map, href: "#" },
  { label: "계약/분양", icon: FileCheck2, href: "#" },
  { label: "수지분석", icon: BarChart3, href: "#" },
  { label: "문서/공지", icon: FileText, href: "#" },
  { label: "연동", icon: CreditCard, href: "#" },
  { label: "설정", icon: Settings, href: "#" },
];

type DetailMenuItem = {
  group?: string;
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
  "기안·결재": [
    {
      defaultDetailLabel: "통합 결재함",
      href: "/approval/inbox",
      label: "기안·결재",
      items: [
        { label: "통합 결재함", href: "/approval/inbox" },
        { label: "기안 목록", href: "/approval" },
        { label: "새 기안", href: "/approval/new" },
        { label: "결재 설정", href: "/basic-info/approval" },
      ],
    },
  ],
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
      defaultDetailLabel: "업무현황",
      href: "/finance/workspace",
      label: "전표·증빙관리",
      items: financeNavigation,
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
  userLabel?: string;
  logoutAction?: () => Promise<void>;
  onQuickMenuSelect?: (label: string) => void;
};

let financeBadgesRequest: Promise<Record<string, number>> | null = null;

function requestFinanceBadges() {
  if (!financeBadgesRequest) {
    financeBadgesRequest = loadFinanceNavigationBadgesAction().then(
      (badges) => {
        financeBadgesRequest = null;
        return badges;
      },
      (error) => {
        financeBadgesRequest = null;
        throw error;
      },
    );
  }
  return financeBadgesRequest;
}

export function ErpShell({ activeDetailLabel, activeLabel = "대시보드", activeWorkspaceLabel, children, onQuickMenuSelect, userLabel = "관리자", logoutAction }: ErpShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [financeBadges, setFinanceBadges] = useState<Record<string, number>>({});
  const sidebarToggleLabel = isSidebarOpen ? "사이드바 닫기" : "사이드바 열기";
  const SidebarToggleIcon = isSidebarOpen ? ChevronLeft : ChevronRight;
  const selectedMenu = normalizeActiveLabel(activeLabel);
  useEffect(() => {
    if (selectedMenu !== "회계/자금") return;
    let active = true;
    void requestFinanceBadges().then((badges) => { if (active) setFinanceBadges(badges); }).catch(() => { /* Navigation remains usable when counts cannot be refreshed. */ });
    return () => { active = false; };
  }, [selectedMenu]);
  const currentWorkspaceMenus = workspaceMenus[selectedMenu] ?? [];
  const selectedWorkspaceLabel = activeWorkspaceLabel ?? defaultWorkspaceLabels[selectedMenu] ?? currentWorkspaceMenus[0]?.label;
  const selectedWorkspace = currentWorkspaceMenus.find((workspace) => workspace.label === selectedWorkspaceLabel) ?? currentWorkspaceMenus[0];
  const currentDetailMenus = selectedWorkspace?.items ?? [];
  const hasDetailMenus = currentDetailMenus.length > 0;
  const [fullMenuFor, setFullMenuFor] = useState<string | null>(null);
  const isDetailMode = hasDetailMenus && fullMenuFor !== selectedMenu;
  const detailLabel = activeDetailLabel ?? selectedWorkspace?.defaultDetailLabel ?? currentDetailMenus[0]?.label;
  const selectedDetailMenu = selectedMenu === "회계/자금" && detailLabel ? normalizeFinanceDetailLabel(detailLabel) : detailLabel;
  const detailMenuContent = currentDetailMenus.map((item, index) => (
    <Fragment key={item.label}>
      {item.group && currentDetailMenus[index - 1]?.group !== item.group ? (
        <p className="px-3 pb-1 pt-4 text-xs font-bold text-[var(--color-fog)]">{item.group}</p>
      ) : null}
      <a
        aria-current={item.label === selectedDetailMenu ? "page" : undefined}
        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-[var(--color-deep-cobalt)] ${item.label === selectedDetailMenu ? "bg-[var(--color-morning-tint)] font-semibold text-[var(--color-midnight-ink)]" : "font-medium text-[var(--color-stone)] hover:bg-white hover:text-[var(--color-midnight-ink)]"}`}
        href={item.href ?? "#"}
      >
        <ReceiptText aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1">{item.label}</span>
        {(financeBadges[item.label] ?? 0) > 0 ? <span aria-label={`${item.label} 대기 ${financeBadges[item.label]}건`} className="min-w-5 rounded-full bg-amber-100 px-1.5 py-0.5 text-center text-[10px] font-bold text-amber-900">{financeBadges[item.label]}</span> : null}
      </a>
    </Fragment>
  ));

  return (
    <div className="min-h-screen bg-[var(--color-sky-wash)] text-[var(--color-midnight-ink)]">
      <aside
        aria-label="사이드바"
        className={`fixed inset-y-0 left-0 z-20 hidden overflow-y-auto overscroll-contain border-r border-[var(--color-soft-border)] bg-[var(--color-paper-white)] py-5 transition-[width] duration-200 motion-reduce:transition-none md:block ${
          isSidebarOpen ? "w-60 px-3" : "w-16 px-2"
        }`}
      >
        {!isSidebarOpen ? <nav aria-label="축소된 전체 메뉴" className="space-y-2 pt-10">
          {primaryNavigation.map((item) => <a key={item.label} href={item.href} title={item.label} aria-label={item.label} aria-current={item.label === selectedMenu ? "page" : undefined} className={`flex size-11 items-center justify-center rounded-lg focus-visible:outline-2 ${item.label === selectedMenu ? "bg-[var(--color-morning-tint)]" : "hover:bg-white"}`}><item.icon aria-hidden="true" className="size-5" /></a>)}
        </nav> : <>
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
            {detailMenuContent}
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

        <ErpQuickMenu badges={financeBadges} onSelect={onQuickMenuSelect} />
        </>}
      </aside>

      <button
        aria-label={sidebarToggleLabel}
        aria-expanded={isSidebarOpen}
        title={sidebarToggleLabel}
        className={`fixed top-4 z-30 hidden size-8 items-center justify-center rounded-lg border border-[var(--color-soft-border)] bg-white text-[var(--color-stone)] shadow-sm transition-[left] duration-200 motion-reduce:transition-none hover:bg-[var(--color-morning-tint)] focus-visible:outline-2 md:flex ${
          isSidebarOpen ? "left-56" : "left-4"
        }`}
        onClick={() => setIsSidebarOpen((current) => !current)}
        type="button"
      >
        <SidebarToggleIcon className="size-4 shrink-0 stroke-[3]" />
      </button>

      <div className={`transition-[padding] duration-200 motion-reduce:transition-none ${isSidebarOpen ? "md:pl-60" : "md:pl-16"}`}>
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
                {userLabel}
              </div>
              {logoutAction ? <form action={logoutAction}><button aria-label="로그아웃" type="submit" className="flex size-9 items-center justify-center rounded-full border border-[var(--color-soft-border)]"><LogOut className="size-4"/></button></form> : <a aria-label="로그아웃" className="hidden size-9 items-center justify-center rounded-full border border-[var(--color-soft-border)] bg-[var(--color-paper-white)] text-[var(--color-stone)] lg:flex" href="#">
                <LogOut className="size-4" />
              </a>}
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

        <div className="border-b border-[var(--color-soft-border)] bg-white px-4 py-2 md:hidden">
          <button
            aria-controls="mobile-workspace-navigation"
            aria-expanded={isMobileMenuOpen}
            aria-label={`${selectedMenu}${selectedDetailMenu ? ` · ${selectedDetailMenu}` : ""} 메뉴 ${isMobileMenuOpen ? "닫기" : "열기"}`}
            className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-sm font-semibold focus-visible:outline-2"
            onClick={() => setIsMobileMenuOpen((current) => !current)}
            type="button"
          >
            <span>{selectedMenu}{selectedDetailMenu ? ` · ${selectedDetailMenu}` : ""}</span>
            <span>{isMobileMenuOpen ? "메뉴 닫기" : "메뉴 열기"}</span>
          </button>
          {isMobileMenuOpen ? (
            <div id="mobile-workspace-navigation" className="max-h-[60dvh] overflow-y-auto overscroll-contain pb-3">
              {hasDetailMenus ? <nav aria-label={`${selectedMenu} 모바일 상세 메뉴`}>{detailMenuContent}</nav> : null}
              <nav aria-label="모바일 전체 메뉴" className="mt-3 border-t border-[var(--color-soft-border)] pt-2">
                {primaryNavigation.map((item) => <a key={item.label} href={item.href} aria-current={item.label === selectedMenu ? "page" : undefined} className="block rounded-lg px-3 py-3 text-sm font-medium">{item.label}</a>)}
              </nav>
            </div>
          ) : null}
        </div>
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
