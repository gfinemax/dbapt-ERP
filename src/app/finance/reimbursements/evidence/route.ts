import { reimbursementEvidence } from "../actions";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  try {
    const id=new URL(request.url).searchParams.get("id")??"";
    const url=await reimbursementEvidence(id);
    const source=await fetch(url,{cache:"no-store"});
    if(!source.ok||!source.body) throw new Error("증빙 원본을 불러오지 못했습니다.");
    const contentType=source.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()??"";
    if(contentType!=="application/pdf"&&!contentType.startsWith("image/")) throw new Error("지원하지 않는 증빙 형식입니다.");
    const headers=new Headers({"Content-Type":contentType,"Content-Disposition":"inline","Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"});
    const contentLength=source.headers.get("content-length");
    if(contentLength)headers.set("Content-Length",contentLength);
    return new Response(source.body,{status:200,headers});
  } catch {
    return new Response("증빙을 열 수 없습니다. 로그인과 열람 권한을 확인해주세요.",{status:403,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  }
}
