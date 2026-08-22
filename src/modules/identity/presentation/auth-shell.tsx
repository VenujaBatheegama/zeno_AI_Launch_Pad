import type { ReactNode } from "react";

import { RibbonBackdrop } from "@/modules/product-shell/ui/ribbon-backdrop";
import { ZenoMark } from "./zeno-mark";

export function AuthShell(props: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[var(--zeno-bg)] px-4 py-10 sm:px-6">
      <RibbonBackdrop className="pointer-events-none fixed inset-0 z-0 overflow-hidden" />
      <div className="relative z-10 mx-auto flex w-full max-w-md flex-col gap-8">
        <div className="text-center">
          <ZenoMark className="justify-center text-lg" />
          <h1 className="mt-8 text-[1.75rem] font-semibold tracking-[-0.01em] text-[var(--zeno-ink)] sm:text-[2rem]">
            {props.title}
          </h1>
          <p className="mt-2 text-[15px] leading-6 text-[var(--zeno-ink-muted)]">
            {props.subtitle}
          </p>
        </div>
        <div className="rounded-[var(--zeno-radius-lg)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-6 shadow-[var(--zeno-shadow-md)] sm:p-8">
          {props.children}
        </div>
        {props.footer ? (
          <div className="text-center text-sm text-[var(--zeno-ink-muted)]">
            {props.footer}
          </div>
        ) : null}
      </div>
    </main>
  );
}
