import { requireReimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { reimbursementDb } from "@/features/finance/reimbursement-repository";
import { budgetUsed, budgetRemaining, type ReimbursementReport } from "@/features/finance/reimbursement-domain";
import { notFound } from "next/navigation";
export const dynamic="force-dynamic";
export default async function ReportPage({searchParams}:{searchParams:Promise<{month?:string;revision?:string}>}) {
  const member=await requireReimbursementIdentity();
  if(!member.permissions.length) notFound();
  const params=await searchParams;
  if(!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(params.month??"")||!/^\d+$/.test(params.revision??"")) notFound();
  const {data,error}=await reimbursementDb().schema("finance").from("reimbursement_reports").select("month,revision,created_at,reason,snapshot").eq("organization_id",member.organization_id).eq("month",params.month!).eq("revision",Number(params.revision)).single();
  if(error||!data) notFound();
  const r=data as ReimbursementReport;
  return <main className="mx-auto max-w-6xl p-8 text-sm"><h1 className="mb-4 text-2xl font-bold">{r.month.slice(0,7)} 월 예산 마감 보고서 · 버전 {r.revision}</h1><p>확정 일시: {new Date(r.created_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</p><p className="my-3">사유: {r.reason}</p><p className="mb-5">{r.snapshot.schema_version===2?"귀속 확인된 간편지출·개인 정산·지출결의·수기 집행액 및 기안 예약 기준.":"간편지출·개인 정산 승인액·기안 집행 예약액 기준 (통합 전 보관본)."} 회계장부 전체 지출 보고서와 별도이며, 실제 지급액과 예산 사용액은 구분합니다.</p>
    <table className="w-full text-right"><thead><tr className="border-b"><th className="text-left">예산항목</th><th>월 예산</th><th>간편지출</th><th>개인 정산</th><th>지출결의</th><th>수기 확인분</th><th>사용액</th><th>예약액</th><th>가용액</th></tr></thead><tbody>{r.snapshot.budgets.map(b=><tr key={b.id} className="border-b"><th className="py-3 text-left font-normal">{b.budget_item}</th>{[b.monthly_amount,b.quick_amount,b.personal_amount,b.resolution_amount??0,b.manual_amount??0,budgetUsed(b),b.reserved_amount,budgetRemaining(b)].map((n,i)=><td key={i}>{Number(n).toLocaleString("ko-KR")}</td>)}</tr>)}</tbody></table><p className="mt-4">단위: 원 · 이 보고서는 확정 시점의 보관본입니다.</p>{r.snapshot.review?.some(s=>s.needs_review)&&<p className="mt-3 font-bold">추가 귀속 확인 대상이 있어 확인된 금액 기준으로 작성한 수정본입니다.</p>}
    {r.snapshot.entries&&<section className="mt-6"><h2 className="text-lg font-bold">원본별 집계 내역</h2><ul>{r.snapshot.entries.map((e,i)=><li key={i} className="border-b py-2">{e.title} · {e.month.slice(0,7)} · {e.state==="USED"?"사용":e.state==="RESERVED"?"예약":"심사 중"} · {Number(e.amount).toLocaleString("ko-KR")}원 <span className="text-xs">({e.source_kind} / {e.source_id})</span></li>)}</ul></section>}
    <p className="mt-3 print:hidden">브라우저 인쇄 메뉴(Ctrl+P)에서 인쇄하거나 PDF로 저장할 수 있어.</p></main>;
}
