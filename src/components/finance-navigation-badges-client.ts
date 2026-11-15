import { loadFinanceNavigationBadgesAction } from "@/app/finance/navigation/actions";

let financeBadgesRequest: Promise<Record<string, number>> | null = null;
let financeBadgesCache: { badges: Record<string, number>; expiresAt: number } | null = null;
const financeBadgesCacheMs = 60_000;

export function clearFinanceBadgesCache() {
  financeBadgesCache = null;
  financeBadgesRequest = null;
}

export function requestFinanceBadges() {
  if (financeBadgesCache && financeBadgesCache.expiresAt > Date.now()) {
    return Promise.resolve(financeBadgesCache.badges);
  }
  if (!financeBadgesRequest) {
    financeBadgesRequest = loadFinanceNavigationBadgesAction().then(
      (badges) => {
        financeBadgesCache = { badges, expiresAt: Date.now() + financeBadgesCacheMs };
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

