import { reimbursementEvidence } from "../actions";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  try {
    const id=new URL(request.url).searchParams.get("id")??"";
    const url=await reimbursementEvidence(id);
    return new Response(null,{status:302,headers:{Location:url,"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
  } catch {
    return new Response("증빙을 열 수 없습니다. 로그인과 열람 권한을 확인해주세요.",{status:403,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}});
  }
}
