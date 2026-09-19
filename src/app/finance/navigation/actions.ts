"use server";

import { loadFinanceNavigationBadges } from "@/features/finance/finance-navigation-badges";

export async function loadFinanceNavigationBadgesAction() {
  try { return await loadFinanceNavigationBadges(); }
  catch { return {}; }
}
