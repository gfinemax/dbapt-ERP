import { FinanceReviewPage } from "@/features/finance/finance-review-page";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string; page?: string }> }) {
  return <FinanceReviewPage kind="tax-documents" query={await searchParams} />;
}
