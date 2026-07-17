import { BusinessPartnerPage, type BasicInfoSection } from "@/features/basic-info/business-partner-page";
import { listAccountSubjectsFromSupabase } from "@/features/basic-info/account-subject-repository";
import { listBankAccountsFromSupabase } from "@/features/basic-info/bank-account-repository";
import { listBusinessPartnersFromSupabase } from "@/features/basic-info/business-partner-repository";
import { listCreditCardsFromSupabase } from "@/features/basic-info/credit-card-repository";
import { listItemsFromSupabase } from "@/features/basic-info/item-repository";
import { hasSupabaseSecretConfig } from "@/lib/supabase/config";
import { createAccountSubjectsAction, createBankAccountAction, createCreditCardAction, createItemAction, createManualBusinessPartnerAction, updateBankAccountAction, updateBusinessPartnerAction } from "./actions";

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
  const businessPartnerLoadError = initialSection === "partners" && initialBusinessPartners === null
    ? "거래처 정보를 불러오지 못했습니다. Supabase 연결과 finance.business_partners 테이블을 확인해 주세요."
    : undefined;
  const initialItems = initialSection === "items" ? await listItemsFromSupabase() : null;
  const initialCreditCards = initialSection === "cards" ? await listCreditCardsFromSupabase() : null;
  const hasRemoteWriteConfig = hasSupabaseSecretConfig();

  return (
    <BusinessPartnerPage
      businessPartnerLoadError={businessPartnerLoadError}
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
      createBusinessPartner={shouldEnableBasicInfoRemoteCreate(hasRemoteWriteConfig, initialSection, "partners", initialBusinessPartners) ? createManualBusinessPartnerAction : undefined}
      createCreditCard={shouldEnableBasicInfoRemoteCreate(hasRemoteWriteConfig, initialSection, "cards", initialCreditCards) ? createCreditCardAction : undefined}
      createItem={shouldEnableBasicInfoRemoteCreate(hasRemoteWriteConfig, initialSection, "items", initialItems) ? createItemAction : undefined}
      initialAccountSubjects={initialAccountSubjects ?? undefined}
      initialBankAccounts={initialBankAccounts ?? undefined}
      initialBusinessPartners={initialSection === "partners" ? initialBusinessPartners ?? [] : undefined}
      initialCreditCards={initialCreditCards ?? undefined}
      initialItems={initialItems ?? undefined}
      initialSection={initialSection}
      updateBusinessPartner={shouldEnableBasicInfoRemoteCreate(hasRemoteWriteConfig, initialSection, "partners", initialBusinessPartners) ? updateBusinessPartnerAction : undefined}
      updateBankAccount={
        shouldEnableBasicInfoRemoteCreate(hasRemoteWriteConfig, initialSection, "bank-accounts", initialBankAccounts)
          ? updateBankAccountAction
          : undefined
      }
    />
  );
}
