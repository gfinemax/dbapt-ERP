const periodKeyPrefix = "__budget_period__";

export function budgetProfilePeriodKey(budgetItem: string, budgetPeriod: string) {
  return `${periodKeyPrefix}${budgetPeriod}__${budgetItem}`;
}

export function isBudgetProfilePeriodKey(key: string) {
  return key.startsWith(periodKeyPrefix);
}

function normalizeBudgetItem(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[^0-9a-z가-힣]/g, "");
}

export function resolveBudgetProfile<T>(
  budgetItem: string,
  budgetPeriod: string | undefined,
  budgetProfiles: Record<string, T>,
): T | undefined {
  if (budgetPeriod) {
    const periodExact = budgetProfiles[budgetProfilePeriodKey(budgetItem, budgetPeriod)];
    if (periodExact) return periodExact;
  }

  const exact = budgetProfiles[budgetItem];
  if (exact) return exact;

  const normalizedRequested = normalizeBudgetItem(budgetItem);
  if (!normalizedRequested) return undefined;
  const matchingItem = Object.keys(budgetProfiles)
    .filter((key) => !isBudgetProfilePeriodKey(key))
    .map((key) => ({ key, normalized: normalizeBudgetItem(key) }))
    .filter(({ normalized }) => normalized && (
      normalizedRequested.includes(normalized) || normalized.includes(normalizedRequested)
    ))
    .sort((left, right) => right.normalized.length - left.normalized.length)[0]?.key;
  if (!matchingItem) return undefined;

  if (budgetPeriod) {
    return budgetProfiles[budgetProfilePeriodKey(matchingItem, budgetPeriod)] ?? budgetProfiles[matchingItem];
  }
  return budgetProfiles[matchingItem];
}
