import type { ExpenseEvidenceUploadResult } from "@/features/finance/expense-evidence";
import { uploadExpenseEvidenceAction } from "@/app/finance/expense-resolutions/actions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json(uploadFailure("INVALID_FILE", "허용되지 않은 업로드 요청입니다."), { status: 403 });
  }
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    logRouteFailure(error, "FORM_DATA");
    return Response.json(uploadFailure("INVALID_FILE", "증빙파일 전송 형식을 확인하지 못했습니다. 파일을 다시 선택해 주세요."), { status: 400 });
  }
  try {
    const result = await uploadExpenseEvidenceAction(formData);
    return Response.json(result, { status: result.ok ? 201 : 400 });
  } catch (error) {
    logRouteFailure(error, "AUTHORIZATION_OR_UPLOAD");
    const classified = classifyExpenseEvidenceRouteError(error);
    return Response.json(classified.failure, { status: classified.status });
  }
}

export function classifyExpenseEvidenceRouteError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("로그인이 필요")) {
    return { failure: uploadFailure("AUTH_REQUIRED", "로그인이 만료됐어. 페이지를 새로고침한 뒤 다시 로그인해줘."), status: 401 } as const;
  }
  if (message.includes("권한") || message.includes("활성 조합")) {
    return { failure: uploadFailure("ACCESS_DENIED", "증빙 등록 권한을 확인하지 못했어. 관리자에게 계정 권한을 확인해줘."), status: 403 } as const;
  }
  return { failure: uploadFailure("UNEXPECTED", "증빙자료 전송 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."), status: 500 } as const;
}

function logRouteFailure(error: unknown, stage: string) {
  console.error(JSON.stringify({
    error: error instanceof Error ? error.message : String(error),
    level: "error",
    message: "expense evidence upload route failed",
    stage,
  }));
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
