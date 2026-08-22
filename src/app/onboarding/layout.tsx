import Link from "next/link";

import { ZenoMark } from "@/modules/identity/presentation/zeno-mark";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--zeno-bg)]">
      {children}
    </div>
  );
}
