import { describe, expect, it } from "vitest";
import {
  dashboardModules,
  dashboardStats,
  integrationStatuses,
} from "./dashboard-data";

describe("dashboard data", () => {
  it("defines the six ERP module cards in display order", () => {
    expect(dashboardModules.map((module) => module.name)).toEqual([
      "조합원관리",
      "회계/자금",
      "총회관리",
      "토지관리",
      "수지분석",
      "문서/공지",
    ]);
  });

  it("keeps the key dashboard stats available for the first screen", () => {
    expect(dashboardStats.map((stat) => stat.label)).toEqual([
      "전체 조합원",
      "납부율",
      "예산 집행률",
      "토지 확보율",
      "다음 총회",
    ]);
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
});
