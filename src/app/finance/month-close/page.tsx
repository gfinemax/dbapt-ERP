import { FinanceReviewPage } from "@/features/finance/finance-review-page";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string; page?: string; scope?: string }> }) {
  return <FinanceReviewPage kind="month-close" query={await searchParams} />;
}
