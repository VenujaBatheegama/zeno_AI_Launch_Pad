import { RibbonBackdrop } from "@/modules/product-shell/ui/ribbon-backdrop";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[var(--zeno-bg)]">
      <RibbonBackdrop className="pointer-events-none fixed inset-0 z-0 overflow-hidden" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
