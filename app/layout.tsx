import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "共讀花園 · life-study-together",
  description: "一起讀聖經與生命讀經，累積我們的共同花園。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "./favicon.svg",
    shortcut: "./favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}
