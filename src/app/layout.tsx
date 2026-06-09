import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "https://wpspot.io"),
  title: {
    default: "WPSpot - WordPress를 Blogspot에서 무료 운영 | 엔터프라이즈 호스팅",
    template: "%s | WPSpot",
  },
  description:
    "WordPress를 Blogspot 위에서 100% 무료로 실행. GitHub Actions 자동 배포, SQLite DB, Cloudflare 최적화, WebSocket 실시간. 플러그인·테마 완전 호환.",
  keywords: [
    "WordPress 무료 호스팅",
    "Blogspot WordPress",
    "GitHub Pages WordPress",
    "SQLite WordPress",
    "무료 블로그 호스팅",
  ],
  authors: [{ name: "WPSpot" }],
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "https://wpspot.io",
    siteName: "WPSpot",
    title: "WPSpot - WordPress를 Blogspot에서 무료 운영",
    description: "WordPress × Blogspot × GitHub. 엔터프라이즈 성능, 비용 0원.",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "WPSpot - WordPress를 Blogspot에서 무료 운영",
    description: "WordPress × Blogspot × GitHub. 엔터프라이즈 성능, 비용 0원.",
    images: ["/og-image.png"],
  },
  alternates: { canonical: "https://wpspot.io" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        {/* Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "WPSpot",
              applicationCategory: "WebApplication",
              description: "WordPress를 Blogspot에서 무료로 운영하는 호스팅 플랫폼",
              offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" },
              operatingSystem: "Web",
            }),
          }}
        />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
