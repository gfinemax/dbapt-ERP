import { FinanceDetailPage } from "@/features/finance/finance-detail-page";

type FinanceDetailRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function FinanceDetailRoute({ params }: FinanceDetailRouteProps) {
  const { id } = await params;

  return <FinanceDetailPage transactionId={id} />;
}
