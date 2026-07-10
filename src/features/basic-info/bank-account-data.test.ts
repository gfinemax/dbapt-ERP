import { describe, expect, it } from "vitest";
import { registeredBankAccounts } from "./business-partner-data";

describe("registered bank account data", () => {
  it("registers the provided Daebang bank account list without old KB mock accounts", () => {
    expect(registeredBankAccounts).toHaveLength(9);
    expect(registeredBankAccounts).toEqual([
      expect.objectContaining({
        accountName: "안동연(대방동지주택)",
        accountNo: "1006-901-293047",
        accountType: "운영계좌",
        bankName: "우리은행",
        createdAt: "2008-07-09",
      }),
      expect.objectContaining({
        accountName: "안동연(대방동지주택)",
        accountNo: "56291000762005",
        accountType: "운영계좌",
        bankName: "하나은행",
        createdAt: "2012-05-14",
      }),
      expect.objectContaining({
        accountName: "조합 여직원명의",
        accountNo: "110-365-172420",
        accountType: "운영계좌",
        bankName: "신한은행",
        createdAt: "2012-05-29",
      }),
      expect.objectContaining({
        accountName: "대방동지역주택조합",
        accountNo: "071-114261-04-017",
        accountType: "운영계좌",
        bankName: "기업은행",
        createdAt: "2021-02-26",
      }),
      expect.objectContaining({
        accountName: "대방동지역주택조합",
        accountNo: "131-022-540467",
        accountType: "운영계좌",
        bankName: "신협은행",
        createdAt: "2024-12-04",
      }),
      expect.objectContaining({
        accountName: "무궁화신탁(업무대행비)",
        accountNo: "1005-403-950770",
        accountType: "신탁계좌",
        bankName: "우리은행",
        createdAt: "2020-04-29",
      }),
      expect.objectContaining({
        accountName: "무궁화신탁(분담금)",
        accountNo: "1005-503-950527",
        accountType: "신탁계좌",
        bankName: "우리은행",
        createdAt: "2020-05-02",
      }),
      expect.objectContaining({
        accountName: "대방동지역주택조합",
        accountNo: "029301-04-179045",
        accountType: "운영계좌",
        bankName: "국민은행",
        createdAt: "2012-11-02",
      }),
      expect.objectContaining({
        accountName: "대방동지역주택조합",
        accountNo: "131-022-540467",
        accountType: "운영계좌",
        bankName: "신협",
        createdAt: "2024-12-04",
      }),
    ]);
    expect(registeredBankAccounts.some((account) => account.accountName === "국민은행 신탁계좌")).toBe(false);
    expect(registeredBankAccounts.some((account) => account.accountName === "국민은행 운영계좌")).toBe(false);
  });
});
