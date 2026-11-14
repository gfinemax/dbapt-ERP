import { describe, expect, it } from "vitest";
import {
  expenseResolutionListHref,
  expenseResolutionListPageSize,
  getExpenseResolutionSearchPattern,
  normalizeExpenseResolutionSort,
  parseExpenseResolutionListRequest,
} from "./expense-resolution-list";

describe("expense resolution list navigation", () => {
  it("keeps the initial hydration page intentionally small", () => {
    expect(expenseResolutionListPageSize).toBe(25);
  });

  it("normalizes invalid pages and bounds the server search query", () => {
    expect(parseExpenseResolutionListRequest({ page: "0", q: "  복사용지  " })).toEqual({
      month: "",
      page: 1,
      pageSize: expenseResolutionListPageSize,
      query: "복사용지",
      sort: "updated_desc",
    });
    expect(parseExpenseResolutionListRequest({ page: "20000", q: "가".repeat(120) })).toMatchObject({
      month: "",
      page: 10_000,
      query: "가".repeat(100),
      sort: "updated_desc",
    });
  });

  it("creates safe PostgREST search tokens without filter punctuation", () => {
    expect(getExpenseResolutionSearchPattern("지결-2026-0001, (복사용지)")).toBe("지결-2026-0001%복사용지");
    expect(getExpenseResolutionSearchPattern(",() .")).toBe("");
  });

  it("keeps the first page URL compact and encodes searches", () => {
    expect(expenseResolutionListHref(1, "")).toBe("/finance/expense-resolutions");
    expect(expenseResolutionListHref(3, "사무 용품")).toBe("/finance/expense-resolutions?page=3&q=%EC%82%AC%EB%AC%B4+%EC%9A%A9%ED%92%88");
  });

  it("keeps a validated actual-expense month in parsing and navigation", () => {
    expect(parseExpenseResolutionListRequest({ month: "2026-01" })).toMatchObject({ month: "2026-01", page: 1 });
    expect(parseExpenseResolutionListRequest({ month: "2026-13" })).toMatchObject({ month: "" });
    expect(expenseResolutionListHref(1, "옛골식당", "2026-01"))
      .toBe("/finance/expense-resolutions?q=%EC%98%9B%EA%B3%A8%EC%8B%9D%EB%8B%B9&month=2026-01");
  });

  it("validates and preserves the expense-date sort order", () => {
    expect(parseExpenseResolutionListRequest({ sort: "expense_date_asc" })).toMatchObject({ sort: "expense_date_asc" });
    expect(normalizeExpenseResolutionSort("unknown")).toBe("updated_desc");
    expect(expenseResolutionListHref(1, "옛골식당", "2026-01", "expense_date_desc"))
      .toBe("/finance/expense-resolutions?q=%EC%98%9B%EA%B3%A8%EC%8B%9D%EB%8B%B9&month=2026-01&sort=expense_date_desc");
  });
});
