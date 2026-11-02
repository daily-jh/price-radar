import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PRICE RADAR · 개인 가격 관측소",
  description: "출시가, 네이버 최저가, 핫딜과 반품 가격을 비교하는 개인 관측소",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head><link rel="stylesheet" href="/style.css"/></head>
      <body>{children}</body>
    </html>
  );
}
