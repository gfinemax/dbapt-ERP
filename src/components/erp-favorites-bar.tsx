"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ErpQuickMenu } from "./erp-quick-menu";
import { requestFinanceBadges } from "./finance-navigation-badges-client";

export function ErpFavoritesBar({ accountKey }: { accountKey: string }) {
  const pathname = usePathname();
  const scope = accountKey + ":" + pathname;
  const [counts, setCounts] = useState<{ scope: string; badges: Record<string, number> } | null>(null);
  useEffect(() => {
    if (accountKey === "anonymous") return;
    let active = true;
    const loadBadges = () => {
      void requestFinanceBadges().then((badges) => {
        if (active) setCounts({ scope: accountKey, badges });
      }).catch(() => { /* Favorites remain available when counts cannot be refreshed. */ });
    };
    const idleWindow = window as Window & { requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number; cancelIdleCallback?: (handle: number) => void };
    const idleHandle = idleWindow.requestIdleCallback?.(loadBadges, { timeout: 1500 });
    const timer = idleHandle === undefined ? window.setTimeout(loadBadges, 0) : undefined;
    return () => {
      active = false;
      if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [accountKey]);
  return <div data-erp-global-favorites className="sticky top-0 z-40 bg-[var(--color-paper-white)] text-[var(--color-midnight-ink)] shadow-sm print:hidden">
    <ErpQuickMenu key={scope} badges={counts?.scope === accountKey ? counts.badges : {}} />
  </div>;
}
