import { NextRequest } from "next/server";

import { requireExpenseActor } from "@/features/finance/expense-authorization";
import { koreaDate } from "@/features/finance/reimbursement-domain";
import { buildTaxAccountantWorkbook, loadTaxAccountantExportData } from "@/features/finance/tax-accountant-export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  let actor: Awaited<ReturnType<typeof requireExpenseActor>>;
  try {
    actor = await requireExpenseActor("ADMIN");
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "관리자 권한을 확인하지 못했어." }, { status: 403 });
  }

  try {
    const requestedMonth = request.nextUrl.searchParams.get("month") ?? "";
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) ? requestedMonth : koreaDate().slice(0, 7);
    const workbook = await buildTaxAccountantWorkbook(await loadTaxAccountantExportData(actor.organization_id, month));
    return new Response(new Uint8Array(workbook), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="tax-accountant-${month}.xlsx"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error) {
    console.error("Failed to export tax accountant workbook", error);
    return Response.json({ message: "세무사 전달 자료를 만들지 못했어. 잠시 후 다시 시도해줘." }, { status: 500 });
  }
}
