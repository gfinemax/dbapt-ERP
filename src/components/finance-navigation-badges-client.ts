import { loadFinanceNavigationBadgesAction } from "@/app/finance/navigation/actions";

let financeBadgesRequest: Promise<Record<string, number>> | null = null;

export function requestFinanceBadges() {
  if (!financeBadgesRequest) {
    financeBadgesRequest = loadFinanceNavigationBadgesAction().then(
      (badges) => {
        financeBadgesRequest = null;
        return badges;
      },
      (error) => {
        financeBadgesRequest = null;
        throw error;
      },
    );
  }
  return financeBadgesRequest;
}

