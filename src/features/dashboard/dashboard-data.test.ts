import { describe, expect, it } from "vitest";
import {
  buildDashboardStats,
  cashFlowWidget,
  dashboardModules,
  dashboardStats,
  depositBalanceWidget,
  integrationStatuses,
} from "./dashboard-data";

describe("dashboard data", () => {
  it("defines the six ERP module cards in display order", () => {
    expect(dashboardModules.map((module) => module.name)).toEqual([
      "조합원관리",
      "회계·자금",
      "총회관리",
      "토지관리",
      "수지분석",
      "문서/공지",
    ]);
  });

  it("keeps the key dashboard stats available for the first screen", () => {
    expect(dashboardStats.map((stat) => stat.label)).toEqual([
      "등기조합원",
      "지출결의 승인대기",
      "납부율",
      "예산 집행률",
      "토지 확보율",
      "다음 총회",
    ]);
  });

  it("formats the registered member count from peopleON pagination", () => {
    const stats = buildDashboardStats(85);

    expect(stats[0]).toMatchObject({
      description: "peopleON 등기조합원 기준",
      label: "등기조합원",
      value: "85명",
    });
  });

  it("uses the current registered member count when peopleON is unavailable", () => {
    expect(buildDashboardStats(undefined)[0]?.value).toBe("85명");
  });

  it("shows the next general meeting as a stable calendar date", () => {
    expect(dashboardStats.find((stat) => stat.label === "다음 총회")).toMatchObject({
      description: "2026년 정기총회 준비 중",
      value: "12월 26일",
    });
    expect(dashboardModules.find((module) => module.name === "총회관리")?.metric).toBe("총회 12월 26일");
  });

  it("tracks all five integration sources", () => {
    expect(integrationStatuses.map((status) => status.source)).toEqual([
      "peopleON",
      "VoteCast",
      "db-landon",
      "valueON",
      "dbapt-site",
    ]);
  });

  it("defines the regional housing association cash flow widget", () => {
    expect(cashFlowWidget.title).toBe("자금 입출금 및 전표처리 현황");
    expect(cashFlowWidget.viewModes).toEqual(["일별", "월별", "분기별"]);
    expect(cashFlowWidget.periodRange).toBe("2026년 01월 01일 ~ 2026년 12월 31일");
    expect(cashFlowWidget.chart.monthly.map((item) => item.label)).toEqual(["11월", "12월", "1월", "2월", "3월", "4월"]);
    expect(cashFlowWidget.statusGroups.map((group) => group.title)).toEqual(["수입", "지출"]);
    expect(cashFlowWidget.statusGroups[1].items.map((item) => item.label)).toContain("운영비");
  });

  it("defines the deposit balance widget", () => {
    expect(depositBalanceWidget.title).toBe("입출식예금 잔액");
    expect(depositBalanceWidget.totalAmount).toBe("1,436,936원");
    expect(depositBalanceWidget.accounts).toEqual([{ bankName: "신협", amount: "1,436,936원" }]);
  });
});
