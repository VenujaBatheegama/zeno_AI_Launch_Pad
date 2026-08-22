"use client";

import { useEffect, useRef } from "react";
import { TelegramConnectPanel } from "./telegram-connect-panel";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export function TelegramConnectModal({ isOpen, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="telegram-modal-title"
        className="relative z-10 w-full max-w-xl overflow-hidden rounded-[24px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between pb-4 border-b border-[var(--zeno-border)]">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-[#229ED9]/15 text-[#229ED9]">
              <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
              </svg>
            </div>
            <div>
              <h2 id="telegram-modal-title" className="text-base font-bold text-[var(--zeno-ink)]">
                Connect Telegram
              </h2>
              <p className="text-xs text-[var(--zeno-ink-muted)]">
                Chat with Zeno & get live job alerts on your phone
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-full text-[var(--zeno-ink-muted)] hover:bg-[var(--zeno-surface-sunken)] hover:text-[var(--zeno-ink)] transition"
          >
            ✕
          </button>
        </div>

        <div className="mt-4">
          <TelegramConnectPanel onConnected={() => setTimeout(onClose, 1500)} />
        </div>
      </div>
    </div>
  );
}
