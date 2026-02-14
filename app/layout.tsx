import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://red-tool.vercel.app"),
  title: "REDIST — AI-Powered Equity Distribution",
  description: "Collaboratively distribute equity among co-founders based on responsibilities, experience, and contributions. AI-assisted, transparent, and fair.",
  openGraph: {
    title: "REDIST — AI-Powered Equity Distribution",
    description: "Collaboratively distribute equity among co-founders based on responsibilities, experience, and contributions.",
    type: "website",
    siteName: "REDIST",
    url: "https://red-tool.vercel.app",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "REDIST - AI-Powered Equity Distribution",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "REDIST — AI-Powered Equity Distribution",
    description: "Collaboratively distribute equity among co-founders based on responsibilities, experience, and contributions.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <main>
          {children}
        </main>
      </body>
    </html>
  );
}
