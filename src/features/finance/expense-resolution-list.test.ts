import { describe, expect, it } from "vitest";
import {
  expenseResolutionListHref,
  expenseResolutionListPageSize,
  getExpenseResolutionSearchPattern,
  parseExpenseResolutionListRequest,
} from "./expense-resolution-list";

describe("expense resolution list navigation", () => {
  it("normalizes invalid pages and bounds the server search query", () => {
    expect(parseExpenseResolutionListRequest({ page: "0", q: "  복사용지  " })).toEqual({
      page: 1,
      pageSize: expenseResolutionListPageSize,
      query: "복사용지",
    });
    expect(parseExpenseResolutionListRequest({ page: "20000", q: "가".repeat(120) })).toMatchObject({
      page: 10_000,
      query: "가".repeat(100),
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
});
