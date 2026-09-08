import { FinanceReviewPage } from "@/features/finance/finance-review-page";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string; page?: string; source?: string }> }) {
  return <FinanceReviewPage kind="evidence" query={await searchParams} />;
}
