import { describe, expect, it } from "vitest";
import { registeredBankAccounts } from "./business-partner-data";

describe("registered bank account data", () => {
  it("preserves the provided eleven-account registry and its verification balances", () => {
    expect(registeredBankAccounts).toHaveLength(11);
    expect(registeredBankAccounts.map((account) => ({
      accountName: account.accountName,
      accountNo: account.accountNo,
      accountPurpose: account.accountPurpose,
      accountType: account.accountType,
      bankName: account.bankName,
      createdAt: account.createdAt,
      currentBalance: account.currentBalance ?? null,
      verifiedAt: account.verifiedAt || null,
    }))).toEqual([
      { accountName: "안동연(대방동지주택)", accountNo: "1006-901-293047", accountPurpose: "조합 운영비", accountType: "운영계좌", bankName: "우리은행", createdAt: "2008-07-09", currentBalance: 1479, verifiedAt: "2026-08-25" },
      { accountName: "안동연(대방동지주택)", accountNo: "56291000762005", accountPurpose: "조합 운영비", accountType: "운영계좌", bankName: "하나은행", createdAt: "2012-05-14", currentBalance: 169087, verifiedAt: null },
      { accountName: "조합 여직원명의", accountNo: "110-365-172420", accountPurpose: "조합 운영비", accountType: "운영계좌", bankName: "신한은행", createdAt: "2012-05-29", currentBalance: 1737852, verifiedAt: null },
      { accountName: "대방동지역주택조합", accountNo: "071-114261-04-017", accountPurpose: "조합 운영비", accountType: "운영계좌", bankName: "기업은행", createdAt: "2021-02-26", currentBalance: 71, verifiedAt: "2026-08-24" },
      { accountName: "무궁화신탁(업무대행비)", accountNo: "1005-403-950770", accountPurpose: "신탁관리", accountType: "신탁계좌", bankName: "우리은행", createdAt: "2020-04-29", currentBalance: 304785952, verifiedAt: null },
      { accountName: "무궁화신탁(분담금)", accountNo: "1005-503-950527", accountPurpose: "신탁관리", accountType: "신탁계좌", bankName: "우리은행", createdAt: "2020-05-02", currentBalance: 99260064, verifiedAt: null },
      { accountName: "대방동지역주택조합", accountNo: "029301-04-179045", accountPurpose: "조합 운영비", accountType: "운영계좌", bankName: "국민은행", createdAt: "2012-11-02", currentBalance: 5475, verifiedAt: "2026-08-25" },
      { accountName: "대방동지역주택조합", accountNo: "131-022-540467", accountPurpose: "조합 운영비", accountType: "운영계좌", bankName: "신협은행", createdAt: "2024-12-04", currentBalance: 1224905, verifiedAt: "2026-09-10" },
      { accountName: "대방동지역주택조합", accountNo: "9002-2094-4050-7", accountPurpose: "조합 운영비", accountType: "운영계좌", bankName: "마을금고", createdAt: "2026-08-14", currentBalance: null, verifiedAt: null },
      { accountName: "KB부동산신탁(분담금)", accountNo: "349401-04-368831", accountPurpose: "신탁관리", accountType: "신탁계좌", bankName: "KB은행", createdAt: "2026-09-11", currentBalance: null, verifiedAt: null },
      { accountName: "KB부동산신탁(신청금)", accountNo: "349401-04-368844", accountPurpose: "신탁관리", accountType: "신탁계좌", bankName: "KB은행", createdAt: "2026-09-11", currentBalance: null, verifiedAt: null },
    ]);
  });
});
