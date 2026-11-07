import { NextResponse } from "next/server";

import { exportBankTransactionsForLedger } from "@/features/finance/ledger-bank-transaction-export";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await exportBankTransactionsForLedger(request));
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERP 통장거래 조회에 실패했어.";
    const status = message.includes("signature") || message.includes("expired") || message.includes("replayed")
      ? 401
      : message.includes("after_cursor") || message.includes("limit") ? 400 : 503;
    return NextResponse.json({ error: message, success: false }, { status });
  }
}
