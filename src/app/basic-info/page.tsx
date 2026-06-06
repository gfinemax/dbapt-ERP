import { BusinessPartnerPage, type BasicInfoSection } from "@/features/basic-info/business-partner-page";

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

  return <BusinessPartnerPage initialSection={parseBasicInfoSection(params?.section)} />;
}
