"use client";

import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";

export type TelegramConnection = {
  connected: boolean;
  optedIn: boolean;
  displayName: string | null;
  enabled: boolean;
  botUsername: string | null;
};

export type TelegramCode = {
  code: string;
  expiresAt: string;
  botUsername: string;
  botUrl: string;
};

type Props = {
  /** Optional callback fired when connection status changes to connected */
  onConnected?: () => void;
};

export function TelegramConnectPanel({ onConnected }: Props) {
  const [telegram, setTelegram] = useState<TelegramConnection | null>(null);
  const [telegramCode, setTelegramCode] = useState<TelegramCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "command" | null>(null);
  const [polling, setPolling] = useState(false);
  const copyTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadTelegram = useCallback(async (isBackgroundPoll = false) => {
    try {
      if (!isBackgroundPoll) setError(null);
      const response = await fetch("/api/telegram/link", { cache: "no-store" });
      const json = (await response.json()) as TelegramConnection & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(json.error ?? "Could not load Telegram settings.");
      }
      setTelegram(json);
      if (json.connected) {
        setTelegramCode(null);
        setPolling(false);
        onConnected?.();
      }
    } catch (err) {
      if (!isBackgroundPoll) {
        setError(err instanceof Error ? err.message : "Could not load Telegram settings.");
      }
    }
  }, [onConnected]);

  useEffect(() => {
    void loadTelegram();
  }, [loadTelegram]);

  // Live Auto-Polling: When a connection code is active, poll every 2.5s
  useEffect(() => {
    if (!telegramCode || telegram?.connected) {
      setPolling(false);
      return;
    }

    setPolling(true);
    const interval = setInterval(() => {
      void loadTelegram(true);
    }, 2500);

    return () => clearInterval(interval);
  }, [telegramCode, telegram?.connected, loadTelegram]);

  async function createTelegramCode() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/telegram/link", { method: "POST" });
      const json = (await response.json()) as TelegramCode & { error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "Could not create Telegram connection code.");
      }
      setTelegramCode(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create Telegram connection code.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnectTelegram() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/telegram/link", { method: "DELETE" });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "Could not disconnect Telegram.");
      }
      setTelegramCode(null);
      await loadTelegram();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect Telegram.");
    } finally {
      setBusy(false);
    }
  }

  function copyToClipboard(text: string, kind: "code" | "command") {
    void navigator.clipboard.writeText(text);
    setCopied(kind);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(null), 2500);
  }

  if (!telegram) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-[var(--zeno-ink-muted)]">
        <span className="inline-block size-4 animate-spin rounded-full border-2 border-[var(--zeno-primary)] border-t-transparent" />
        <span>Loading Telegram status…</span>
      </div>
    );
  }

  if (!telegram.enabled) {
    return (
      <div className="rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-warning-soft)] p-4 text-sm text-[var(--zeno-warning)]">
        <p className="font-semibold">Telegram not configured</p>
        <p className="mt-1 text-xs opacity-90">
          Telegram integration is not configured for this Zeno deployment yet.
        </p>
      </div>
    );
  }

  if (telegram.connected) {
    return (
      <div className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-[#229ED9]/15 text-[#229ED9]">
              <TelegramIcon className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[var(--zeno-ink)]">
                  Connected {telegram.displayName}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--zeno-success-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--zeno-success)]">
                  <span className="size-1.5 rounded-full bg-[var(--zeno-success)]" />
                  Active
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[var(--zeno-ink-muted)]">
                Chatting & alerts are enabled. Send <code className="rounded bg-[var(--zeno-surface-sunken)] px-1 py-0.5 font-mono text-[11px]">/help</code> to the Zeno bot anytime.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void disconnectTelegram()}
            className="rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-3 py-1.5 text-xs font-semibold text-[var(--zeno-ink-muted)] hover:border-[var(--zeno-border-hover)] hover:text-[var(--zeno-danger)] disabled:opacity-50 transition"
          >
            {busy ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-danger-soft)] p-3 text-xs text-[var(--zeno-danger)]">
          {error}
        </div>
      ) : null}

      {!telegramCode ? (
        <div className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5">
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#229ED9]/15 text-[#229ED9]">
              <TelegramIcon className="size-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-[15px] font-semibold text-[var(--zeno-ink)]">
                Connect Telegram to your account
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-[var(--zeno-ink-muted)]">
                Chat with Zeno Career Friend on the go, tailor CVs, and receive instant alerts when high-match opportunities are discovered.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void createTelegramCode()}
                  className="inline-flex items-center gap-2 rounded-full bg-[#229ED9] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1e8ec3] disabled:opacity-50"
                >
                  <TelegramIcon className="size-3.5" />
                  <span>{busy ? "Generating link…" : "Connect Telegram"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] shadow-[var(--zeno-shadow-sm)]">
          {/* Header */}
          <div className="border-b border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TelegramIcon className="size-4 text-[#229ED9]" />
                <span className="text-sm font-bold text-[var(--zeno-ink)]">
                  Connect on Phone or Desktop
                </span>
              </div>
              {polling ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--zeno-primary)]/10 px-2.5 py-0.5 text-[11px] font-medium text-[var(--zeno-primary)]">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--zeno-primary)] opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-[var(--zeno-primary)]" />
                  </span>
                  Waiting for you to tap Start…
                </span>
              ) : null}
            </div>
          </div>

          {/* Body: Dual Column (QR on Left for Mobile, Desktop / Manual on Right) */}
          <div className="grid gap-6 p-4 sm:p-6 md:grid-cols-12">
            {/* Column 1: QR Code for Mobile (Phone users) */}
            <div className="flex flex-col items-center justify-center border-b border-[var(--zeno-border)] pb-6 text-center md:col-span-5 md:border-b-0 md:border-r md:pb-0 md:pr-6">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--zeno-ink-muted)]">
                Option 1: Phone Camera (Fastest)
              </span>
              <div className="mt-3 rounded-2xl border border-[var(--zeno-border)] bg-white p-3.5 shadow-sm">
                <QRCodeSVG
                  value={telegramCode.botUrl}
                  size={148}
                  level="M"
                  includeMargin={false}
                  bgColor="#FFFFFF"
                  fgColor="#0F172A"
                />
              </div>
              <p className="mt-3 text-xs font-medium text-[var(--zeno-ink)]">
                Point your phone camera here
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--zeno-ink-muted)]">
                Opens the Zeno bot and fills your code automatically.
              </p>
            </div>

            {/* Column 2: Desktop Link + Manual Phone Search */}
            <div className="flex flex-col justify-between space-y-4 md:col-span-7">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--zeno-ink-muted)]">
                  Option 2: On This Device
                </span>
                <p className="mt-1 text-xs text-[var(--zeno-ink-muted)]">
                  If you have Telegram Desktop or Web on this computer:
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <a
                    href={telegramCode.botUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-[#229ED9] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1e8ec3]"
                  >
                    <TelegramIcon className="size-3.5" />
                    <span>Open Telegram App</span>
                  </a>
                </div>
              </div>

              <div className="border-t border-[var(--zeno-border)] pt-3.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--zeno-ink-muted)]">
                  Option 3: Manual Search in Telegram
                </span>
                <ol className="mt-2 space-y-1.5 text-xs text-[var(--zeno-ink-muted)]">
                  <li className="flex items-center gap-1.5">
                    <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--zeno-surface-sunken)] text-[10px] font-bold text-[var(--zeno-ink)]">
                      1
                    </span>
                    <span>
                      Search <strong className="font-semibold text-[var(--zeno-ink)]">@{telegramCode.botUsername}</strong> in Telegram
                    </span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--zeno-surface-sunken)] text-[10px] font-bold text-[var(--zeno-ink)]">
                      2
                    </span>
                    <span>Send message:</span>
                    <code className="rounded bg-[var(--zeno-surface-sunken)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--zeno-primary)]">
                      /start {telegramCode.code}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(`/start ${telegramCode.code}`, "command")}
                      className="ml-1 text-[11px] font-semibold text-[var(--zeno-primary)] hover:underline"
                    >
                      {copied === "command" ? "✓ Copied" : "Copy"}
                    </button>
                  </li>
                </ol>
              </div>

              {/* Expiry & Manual Refresh */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--zeno-border)] pt-3 text-[11px] text-[var(--zeno-ink-muted)]">
                <span>
                  Code expires at {new Date(telegramCode.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <button
                  type="button"
                  onClick={() => void loadTelegram()}
                  className="font-semibold text-[var(--zeno-primary)] hover:underline"
                >
                  Check status
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
    </svg>
  );
}
