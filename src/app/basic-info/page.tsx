import { BusinessPartnerPage, type BasicInfoSection } from "@/features/basic-info/business-partner-page";
import { listAccountSubjectsFromSupabase } from "@/features/basic-info/account-subject-repository";
import { listBankAccountsFromSupabase } from "@/features/basic-info/bank-account-repository";
import { listBusinessPartnersFromSupabase } from "@/features/basic-info/business-partner-repository";
import { hasSupabaseSecretConfig } from "@/lib/supabase/config";
import { createAccountSubjectsAction, createBankAccountAction, updateBankAccountAction } from "./actions";

type BasicInfoRouteProps = {
  searchParams?: Promise<{
    section?: string | string[];
  }>;
};

export function parseBasicInfoSection(section: string | string[] | undefined): BasicInfoSection {
  const value = Array.isArray(section) ? section[0] : section;

  if (value === "items" || value === "bank-accounts" || value === "cards" || value === "account-subjects") {
    return value;
  }

  return "partners";
}

export function shouldEnableBasicInfoRemoteCreate(
  hasSecretConfig: boolean,
  activeSection: BasicInfoSection,
  actionSection: BasicInfoSection,
  initialRows: unknown[] | null,
) {
  return hasSecretConfig && activeSection === actionSection && initialRows !== null;
}

export default async function BasicInfoRoute({ searchParams }: BasicInfoRouteProps) {
  const params = await searchParams;
  const initialSection = parseBasicInfoSection(params?.section);
  const initialAccountSubjects = initialSection === "account-subjects" ? await listAccountSubjectsFromSupabase() : null;
  const initialBankAccounts = initialSection === "bank-accounts" ? await listBankAccountsFromSupabase() : null;
  const initialBusinessPartners = initialSection === "partners" ? await listBusinessPartnersFromSupabase() : null;
  const hasRemoteWriteConfig = hasSupabaseSecretConfig();

  return (
    <BusinessPartnerPage
      createAccountSubjects={
        shouldEnableBasicInfoRemoteCreate(hasRemoteWriteConfig, initialSection, "account-subjects", initialAccountSubjects)
          ? createAccountSubjectsAction
          : undefined
      }
      createBankAccount={
        shouldEnableBasicInfoRemoteCreate(hasRemoteWriteConfig, initialSection, "bank-accounts", initialBankAccounts)
          ? createBankAccountAction
          : undefined
      }
      initialAccountSubjects={initialAccountSubjects ?? undefined}
      initialBankAccounts={initialBankAccounts ?? undefined}
      initialBusinessPartners={initialBusinessPartners ?? undefined}
      initialSection={initialSection}
      updateBankAccount={
        shouldEnableBasicInfoRemoteCreate(hasRemoteWriteConfig, initialSection, "bank-accounts", initialBankAccounts)
          ? updateBankAccountAction
          : undefined
      }
    />
  );
}
