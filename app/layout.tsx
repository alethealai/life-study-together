import type { Metadata, Viewport } from "next";
import "./globals.css";

const basePath = process.env.GITHUB_PAGES === "true"
  ? `/${process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "life-study-together"}`
  : "";

export const viewport: Viewport = {
  themeColor: "#e3e7e3",
};

export const metadata: Metadata = {
  title: "共讀花園 · life-study-together",
  description: "一起讀聖經與生命讀經，累積我們的共同花園。",
  applicationName: "共讀花園",
  manifest: `${basePath}/manifest.webmanifest`,
  appleWebApp: {
    capable: true,
    title: "共讀花園",
    statusBarStyle: "default",
  },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: [
      { url: `${basePath}/icons/favicon-32.png?v=leaf-book`, type: "image/png", sizes: "32x32" },
      { url: `${basePath}/icons/garden-192.png?v=leaf-book`, type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: `${basePath}/icons/apple-touch-icon.png?v=leaf-book`, sizes: "180x180", type: "image/png" }],
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
