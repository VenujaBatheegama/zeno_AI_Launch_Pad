import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zeno",
  description:
    "Find better opportunities, tailor stronger CVs and keep your career moving.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[var(--zeno-bg)] text-[var(--zeno-ink)]">
        {children}
      </body>
    </html>
  );
}
