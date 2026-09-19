export const cleanupCategoryLabels = {
  ALL: "전체",
  CARD_LINK: "카드 연결",
  EVIDENCE: "증빙 보완",
  RESOLUTION: "결의 전환",
  BUDGET: "예산 귀속",
  ROUTE: "처리경로",
} as const;
export type CleanupCategory = Exclude<keyof typeof cleanupCategoryLabels, "ALL">;
export type CleanupItem = {
  id: string;
  category: CleanupCategory;
  sourceKind: string;
  sourceId: string;
  title: string;
  detail: string;
  amount: number | null;
  date: string | null;
  href: string;
  actionLabel: string;
};
export type DataCleanupWorkspace = { items: CleanupItem[]; truncated: boolean };
