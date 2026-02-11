import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EquiSplit — AI-Powered Equity Distribution",
  description: "Collaboratively distribute equity among co-founders based on responsibilities, experience, and contributions. AI-assisted, transparent, and fair.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
