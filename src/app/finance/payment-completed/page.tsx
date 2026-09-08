import { redirect } from "next/navigation";
import { legacyPaymentDestination } from "@/features/finance/payment-navigation";
export default async function PaymentRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(legacyPaymentDestination("PAID", await searchParams));
}