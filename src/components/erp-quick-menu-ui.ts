import { BookOpen, Calculator, CheckCheck, CreditCard, FilePlus2, FileText, Landmark, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { QuickMenuId } from "@/features/finance/erp-quick-menu-catalog";
const icons: Partial<Record<QuickMenuId, LucideIcon>> = {
  "resolution-list": FileText, vouchers: BookOpen, "expense-entry": FilePlus2,
  "approval-inbox": CheckCheck, bank: Landmark, budget: Calculator,
  members: Users, cards: CreditCard, "corporate-use": CreditCard,
  payments: Wallet, refunds: Wallet, resolution: FilePlus2,
};
export function menuIcon(id: QuickMenuId) { return icons[id] ?? FileText; }
export const buttonClass = "inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-[var(--color-soft-border)] bg-white px-2 text-xs font-semibold hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40";
