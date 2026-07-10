import { describe, expect, it } from "vitest";
import writeXlsxFile from "write-excel-file/node";
import { readBankTransactionFile } from "./bank-transaction-file";

describe("bank transaction file reader", () => {
  it("reads the first worksheet from an xlsx file into tab-separated table text", async () => {
    const output = await writeXlsxFile([
      ["항", "목", "거래일자", "거래시간", "거래종류", "적요", "입금", "출금", "잔액", "취급점"].map((value) => ({ value })),
      [
        { value: "운영비" },
        { value: "세무비" },
        { value: "2026/07/04" },
        { value: "10:31" },
        { value: "지급" },
        { value: "한빛세무회계" },
        { value: "" },
        { value: 3300000 },
        { value: 12000000 },
        { value: "우리은행" },
      ],
    ], {
      sheet: "거래내역",
    }, {
      buffer: true,
    });
    const buffer = await output.toBuffer();
    const file = new File([buffer], "은행거래.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    await expect(readBankTransactionFile(file)).resolves.toBe(
      [
        "항\t목\t거래일자\t거래시간\t거래종류\t적요\t입금\t출금\t잔액\t취급점",
        "운영비\t세무비\t2026/07/04\t10:31\t지급\t한빛세무회계\t\t3300000\t12000000\t우리은행",
      ].join("\n"),
    );
  });

  it("formats excel date cells as bank transaction dates", async () => {
    const output = await writeXlsxFile([
      ["거래일자", "적요", "출금"].map((value) => ({ value })),
      [
        { value: new Date(2026, 6, 4), type: Date, format: "yyyy/mm/dd" },
        { value: "KT 인터넷 요금" },
        { value: 55000 },
      ],
    ], {
      sheet: "거래내역",
    }, {
      buffer: true,
    });
    const buffer = await output.toBuffer();
    const file = new File([buffer], "은행거래.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    await expect(readBankTransactionFile(file)).resolves.toBe("거래일자\t적요\t출금\n2026/07/04\tKT 인터넷 요금\t55000");
  });

  it("keeps existing csv and tsv text uploads working", async () => {
    const file = new File(["항,목,거래일자\n운영비,통신비,2026/07/04"], "은행거래.csv", { type: "text/csv" });

    await expect(readBankTransactionFile(file)).resolves.toBe("항,목,거래일자\n운영비,통신비,2026/07/04");
  });
});
