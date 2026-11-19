import { NextResponse } from "next/server";

import { exportAccountSubjectsForLedger } from "@/features/finance/ledger-account-subject-export";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await exportAccountSubjectsForLedger(request));
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERP 계정과목 조회에 실패했어.";
    const status = message.includes("signature") || message.includes("expired") || message.includes("replayed")
      ? 401
      : message.includes("after_cursor") || message.includes("limit") ? 400 : 503;
    return NextResponse.json({ error: message, success: false }, { status });
  }
}
