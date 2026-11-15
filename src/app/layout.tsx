import type { Metadata } from "next";
import "./globals.css";
import { ErpFavoritesBar } from "@/components/erp-favorites-bar";
import { reimbursementIdentity } from "@/features/finance/reimbursement-auth";

export const metadata: Metadata = {
  title: "대방동 지역주택조합 ERP",
  description: "조합원, 총회, 토지, 수지분석을 연결하는 ERP 통합 허브",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const viewer = await reimbursementIdentity().catch(() => null);
  const accountKey = viewer ? viewer.organization_id + ":" + viewer.user_id : "anonymous";
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full antialiased">
        <ErpFavoritesBar accountKey={accountKey} />
        {children}
      </body>
    </html>
  );
}
