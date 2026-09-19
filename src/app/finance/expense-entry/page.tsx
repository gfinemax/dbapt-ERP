import Link from "next/link";
import { ErpShell } from "@/components/erp-shell";
import { expenseResolutionHref } from "@/features/finance/expense-entry";
import { quickExpenseEntryHref } from "@/features/finance/quick-expense-entry";
import { reimbursementIdentity } from "@/features/finance/reimbursement-auth";
import { ReimbursementLogin } from "@/features/finance/reimbursement-page";
import { reimbursementLogout } from "../reimbursements/actions";

export const dynamic = "force-dynamic";

const card = "rounded-2xl border border-slate-200 bg-white p-5";
const action =
  "mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white";
const secondary =
  "mt-4 inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold";

export default async function ExpenseEntryRoute() {
  let member;
  let message;
  try {
    member = await reimbursementIdentity();
  } catch (error) {
    message =
      error instanceof Error ? error.message : "사용자 정보를 불러오지 못했어.";
  }

  const staff = Boolean(member?.permissions.length);
  const content = member ? (
    <div className="space-y-5">
      <header className={card}>
        <h1 className="text-3xl font-bold">지출 등록·신청</h1>
        <p className="mt-2 text-slate-600">
          누가 먼저 지급했는지와 처리 경로를 선택하면 맞는 화면으로 바로 이동해.
        </p>
      </header>
      <section
        className="grid gap-4 lg:grid-cols-2"
        aria-label="지출 등록 방식"
      >
        {staff ? (
          <article className={card}>
            <p className="text-sm font-semibold text-blue-700">
              회사 돈 · 법인카드
            </p>
            <h2 className="mt-1 text-xl font-bold">법인카드 사용 등록</h2>
            <p className="mt-2 text-sm text-slate-600">
              카드 승인내역이 있으면 연결하고, 아직 없으면 사용내용을 임시
              등록해. 기준을 벗어나면 정식 결의로 전환해.
            </p>
            <Link
              className={action}
              href={quickExpenseEntryHref("CORPORATE_CARD")}
            >
              법인카드 간편등록
            </Link>
          </article>
        ) : null}
        {staff ? (
          <article className={card}>
            <p className="text-sm font-semibold text-blue-700">
              회사 돈 · 계좌/현금
            </p>
            <h2 className="mt-1 text-xl font-bold">소액지출 등록</h2>
            <p className="mt-2 text-sm text-slate-600">
              조합 자금으로 이미 지급한 소액 사용을 증빙과 함께 등록하고
              확인받아.
            </p>
            <Link className={secondary} href="/finance/expenses/small">
              소액지출 등록·보완
            </Link>
          </article>
        ) : null}
        <article className={card}>
          <p className="text-sm font-semibold text-violet-700">
            개인 돈 · 개인카드/계좌/현금
          </p>
          <h2 className="mt-1 text-xl font-bold">개인 선지출 환급 신청</h2>
          <p className="mt-2 text-sm text-slate-600">
            개인이 먼저 낸 비용을 신청해. 예산 안이어도 실제 환급은 승인 후
            지급내역과 연결돼야 완료돼.
          </p>
          <Link className={secondary} href="/finance/reimbursements">
            환급 신청·현황
          </Link>
        </article>
        {staff ? (
          <article className={card}>
            <p className="text-sm font-semibold text-amber-700">
              지급 전 또는 사업비
            </p>
            <h2 className="mt-1 text-xl font-bold">정식 지출결의 작성</h2>
            <p className="mt-2 text-sm text-slate-600">
              사전 승인, 사업비, 신탁사 요청이 필요한 지출은 결의서를 작성해
              결재와 집행 경로를 남겨.
            </p>
            <Link
              className={action}
              href={expenseResolutionHref({ start: "advance" })}
            >
              지출결의 작성
            </Link>
          </article>
        ) : null}
        {staff ? (
          <article className={`${card} lg:col-span-2`}>
            <p className="text-sm font-semibold text-emerald-700">
              먼저 받은 회사 돈
            </p>
            <h2 className="mt-1 text-xl font-bold">선지급 사용정산</h2>
            <p className="mt-2 text-sm text-slate-600">
              담당자에게 먼저 지급한 금액과 실제 사용, 반납 또는 추가 지급을
              연결해.
            </p>
            <Link className={secondary} href="/finance/advance-settlements">
              선지급 사용정산 열기
            </Link>
          </article>
        ) : null}
      </section>
      {!staff ? (
        <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-slate-700">
          현재 계정은 본인 선지출 환급 신청만 사용할 수 있어. 회사
          자금·선지급·신탁 업무는 담당 권한이 있는 계정에만 보여.
        </p>
      ) : null}
    </div>
  ) : (
    <ReimbursementLogin
      error={message}
      title="지출 등록·신청"
      description="본인 계정으로 로그인하면 권한에 맞는 등록 경로를 안내해."
    />
  );

  return (
    <ErpShell
      userLabel={member?.display_name ?? "로그인 필요"}
      logoutAction={reimbursementLogout}
      activeLabel="회계/자금"
      activeWorkspaceLabel="전표·증빙관리"
      activeDetailLabel="지출 등록·신청"
    >
      <div className="mx-auto max-w-7xl">{content}</div>
    </ErpShell>
  );
}
