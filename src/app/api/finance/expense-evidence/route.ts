import type { ExpenseEvidenceUploadResult } from "@/features/finance/expense-evidence";
import { uploadExpenseEvidenceAction } from "@/app/finance/expense-resolutions/actions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json(uploadFailure("INVALID_FILE", "허용되지 않은 업로드 요청입니다."), { status: 403 });
  }
  try {
    const result = await uploadExpenseEvidenceAction(await request.formData());
    return Response.json(result, { status: result.ok ? 201 : 400 });
  } catch (error) {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      level: "error",
      message: "expense evidence upload route failed",
    }));
    return Response.json(uploadFailure("UNEXPECTED", "증빙자료 전송 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."), { status: 500 });
  }
}

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const requestHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return Boolean(requestHost) && new URL(origin).host === requestHost;
  } catch {
    return false;
  }
}

function uploadFailure(code: Extract<ExpenseEvidenceUploadResult, { ok: false }>["code"], message: string): ExpenseEvidenceUploadResult {
  return { code, message, ok: false };
}
