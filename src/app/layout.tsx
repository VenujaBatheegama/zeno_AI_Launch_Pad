import type { Metadata, Viewport } from "next";
import "./globals.css";

import { GlobalProgressBar } from "@/modules/product-shell/progress-bar";

export const metadata: Metadata = {
  title: "Zeno",
  description:
    "Find better opportunities, tailor stronger CVs and keep your career moving.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0b10",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[var(--zeno-bg)] text-[var(--zeno-ink)] selection:bg-[var(--zeno-primary)] selection:text-white">
        <GlobalProgressBar />
        {children}
      </body>
    </html>
  );
}
