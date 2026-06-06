import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "대방동 지역주택조합 ERP",
  description: "조합원, 총회, 토지, 수지분석을 연결하는 ERP 통합 허브",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
