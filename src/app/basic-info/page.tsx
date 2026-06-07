import { BusinessPartnerPage, type BasicInfoSection } from "@/features/basic-info/business-partner-page";
import { listBankAccountsFromSupabase } from "@/features/basic-info/bank-account-repository";
import { hasSupabaseSecretConfig } from "@/lib/supabase/config";
import { createBankAccountAction } from "./actions";

type BasicInfoRouteProps = {
  searchParams?: Promise<{
    section?: string | string[];
  }>;
};

export function parseBasicInfoSection(section: string | string[] | undefined): BasicInfoSection {
  const value = Array.isArray(section) ? section[0] : section;

  if (value === "items" || value === "bank-accounts" || value === "cards") {
    return value;
  }

  return "partners";
}

export default async function BasicInfoRoute({ searchParams }: BasicInfoRouteProps) {
  const params = await searchParams;
  const initialSection = parseBasicInfoSection(params?.section);
  const initialBankAccounts = initialSection === "bank-accounts" ? await listBankAccountsFromSupabase() : null;

  return (
    <BusinessPartnerPage
      createBankAccount={hasSupabaseSecretConfig() ? createBankAccountAction : undefined}
      initialBankAccounts={initialBankAccounts ?? undefined}
      initialSection={initialSection}
    />
  );
}
