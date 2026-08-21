"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

type WhatsAppConnection = {
  connected: boolean;
  optedIn: boolean;
  maskedNumber: string | null;
  enabled: boolean;
  businessPhone: string | null;
  provider: "meta" | "twilio";
  sandboxJoinCode: string | null;
};

type WhatsAppCode = {
  code: string;
  expiresAt: string;
  businessPhone: string;
  provider: "meta" | "twilio";
  sandboxJoinCode: string | null;
};

type TelegramConnection = {
  connected: boolean;
  optedIn: boolean;
  displayName: string | null;
  enabled: boolean;
  botUsername: string | null;
};

type TelegramCode = {
  code: string;
  expiresAt: string;
  botUsername: string;
  botUrl: string;
};

export default function SettingsPage() {
  const router = useRouter();
  const [whatsapp, setWhatsapp] = useState<WhatsAppConnection | null>(null);
  const [code, setCode] = useState<WhatsAppCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [telegram, setTelegram] = useState<TelegramConnection | null>(null);
  const [telegramCode, setTelegramCode] = useState<TelegramCode | null>(null);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramError, setTelegramError] = useState<string | null>(null);

  const loadWhatsApp = useCallback(async () => {
    try {
      const response = await fetch("/api/whatsapp/link", { cache: "no-store" });
      const json = (await response.json()) as WhatsAppConnection & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(json.error ?? "Could not load WhatsApp settings.");
      }
      setWhatsapp(json);
      setWhatsappError(null);
    } catch (error) {
      setWhatsappError(
        error instanceof Error
          ? error.message
          : "Could not load WhatsApp settings.",
      );
    }
  }, []);

  const loadTelegram = useCallback(async () => {
    try {
      const response = await fetch("/api/telegram/link", { cache: "no-store" });
      const json = (await response.json()) as TelegramConnection & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(json.error ?? "Could not load Telegram settings.");
      }
      setTelegram(json);
      setTelegramError(null);
    } catch (error) {
      setTelegramError(
        error instanceof Error
          ? error.message
          : "Could not load Telegram settings.",
      );
    }
  }, []);

  useEffect(() => {
    void loadWhatsApp();
    void loadTelegram();
  }, [loadTelegram, loadWhatsApp]);

  const whatsappLink = useMemo(() => {
    if (!code?.businessPhone) return null;
    const phone = code.businessPhone.replace(/\D/gu, "");
    const message = encodeURIComponent(`LINK ${code.code}`);
    return `https://wa.me/${phone}?text=${message}`;
  }, [code]);

  const sandboxJoinLink = useMemo(() => {
    if (
      code?.provider !== "twilio" ||
      !code.businessPhone ||
      !code.sandboxJoinCode
    ) {
      return null;
    }
    const phone = code.businessPhone.replace(/\D/gu, "");
    const message = encodeURIComponent(`join ${code.sandboxJoinCode}`);
    return `https://wa.me/${phone}?text=${message}`;
  }, [code]);

  async function createCode() {
    setBusy(true);
    setWhatsappError(null);
    try {
      const response = await fetch("/api/whatsapp/link", { method: "POST" });
      const json = (await response.json()) as WhatsAppCode & { error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "Could not create a connection code.");
      }
      setCode(json);
    } catch (error) {
      setWhatsappError(
        error instanceof Error
          ? error.message
          : "Could not create a connection code.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function disconnectWhatsApp() {
    setBusy(true);
    setWhatsappError(null);
    try {
      const response = await fetch("/api/whatsapp/link", { method: "DELETE" });
      if (!response.ok) {
        const json = (await response.json()) as { error?: string };
        throw new Error(json.error ?? "Could not disconnect WhatsApp.");
      }
      setCode(null);
      await loadWhatsApp();
    } catch (error) {
      setWhatsappError(
        error instanceof Error
          ? error.message
          : "Could not disconnect WhatsApp.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createTelegramCode() {
    setTelegramBusy(true);
    setTelegramError(null);
    try {
      const response = await fetch("/api/telegram/link", { method: "POST" });
      const json = (await response.json()) as TelegramCode & { error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "Could not create a Telegram link.");
      }
      setTelegramCode(json);
    } catch (error) {
      setTelegramError(
        error instanceof Error
          ? error.message
          : "Could not create a Telegram link.",
      );
    } finally {
      setTelegramBusy(false);
    }
  }

  async function disconnectTelegram() {
    setTelegramBusy(true);
    setTelegramError(null);
    try {
      const response = await fetch("/api/telegram/link", { method: "DELETE" });
      if (!response.ok) {
        const json = (await response.json()) as { error?: string };
        throw new Error(json.error ?? "Could not disconnect Telegram.");
      }
      setTelegramCode(null);
      await loadTelegram();
    } catch (error) {
      setTelegramError(
        error instanceof Error
          ? error.message
          : "Could not disconnect Telegram.",
      );
    } finally {
      setTelegramBusy(false);
    }
  }

  async function signOut() {
    if (isSupabaseAuthConfigured()) {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
    }
    router.replace("/auth/sign-in");
    router.refresh();
  }

  return (
    <div className="max-w-2xl space-y-5">
      <header>
        <h1 className="font-[family-name:var(--zeno-font-display)] text-[2.35rem] leading-none tracking-[-0.03em] text-[var(--zeno-ink)]">
          Settings
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-[var(--zeno-ink-muted)]">
          Manage your Zeno account.
        </p>
      </header>
      <section className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">WhatsApp</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--zeno-ink-muted)]">
              Receive timely Zeno alerts and open Jobs, Inbox, Applications, or
              Growth directly from WhatsApp.
            </p>
          </div>
          {whatsapp?.connected ? (
            <span className="rounded-full bg-[var(--zeno-success-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--zeno-success)]">
              {whatsapp.optedIn ? "Alerts on" : "Alerts paused"}
            </span>
          ) : null}
        </div>

        {whatsappError ? (
          <p className="mt-4 text-sm text-[var(--zeno-danger)]" role="alert">
            {whatsappError}
          </p>
        ) : null}

        {!whatsapp ? (
          <p className="mt-4 text-sm text-[var(--zeno-ink-muted)]">Loading…</p>
        ) : !whatsapp.enabled ? (
          <p className="mt-4 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-warning-soft)] p-3 text-sm text-[var(--zeno-warning)]">
            WhatsApp is not configured for this Zeno deployment yet.
          </p>
        ) : whatsapp.connected ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-bg)] p-4">
            <div>
              <p className="text-sm font-semibold">
                Connected {whatsapp.maskedNumber}
              </p>
              <p className="mt-1 text-xs text-[var(--zeno-ink-muted)]">
                Send HELP to Zeno in WhatsApp to see available commands.
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void disconnectWhatsApp()}
              className="rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-3 py-2 text-sm font-semibold hover:border-[var(--zeno-border-hover)] disabled:opacity-50"
            >
              Disconnect
            </button>
          </div>
        ) : code ? (
          <div className="mt-4 rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] p-4">
            {code.provider === "twilio" ? (
              <div className="mb-4 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-bg)] p-3">
                <p className="text-sm font-semibold">
                  1. Join the WhatsApp demo sandbox
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--zeno-ink-muted)]">
                  This is required once for each demo phone before Zeno can
                  receive or send sandbox messages.
                </p>
                {code.sandboxJoinCode ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <code className="rounded-md bg-[var(--zeno-surface)] px-3 py-2 text-sm font-semibold">
                      join {code.sandboxJoinCode}
                    </code>
                    {sandboxJoinLink ? (
                      <a
                        href={sandboxJoinLink}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-3 py-2 text-sm font-semibold"
                      >
                        Join sandbox
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-2 text-xs font-medium text-[var(--zeno-warning)]">
                    Join the Twilio sandbox using the code shown in the Twilio
                    Console, then continue below.
                  </p>
                )}
              </div>
            ) : null}
            <p className="text-sm font-semibold">
              {code.provider === "twilio"
                ? "2. Link your Zeno account"
                : "Send this message to Zeno"}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <code className="rounded-md bg-[var(--zeno-bg)] px-3 py-2 text-sm font-semibold tracking-[0.08em]">
                LINK {code.code}
              </code>
              {whatsappLink ? (
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-ink)] px-4 py-2 text-sm font-semibold text-white"
                >
                  Open WhatsApp
                </a>
              ) : null}
            </div>
            <p className="mt-3 text-xs text-[var(--zeno-ink-muted)]">
              This one-time code expires at{" "}
              {new Date(code.expiresAt).toLocaleTimeString()}. Return here and
              refresh after Zeno confirms the connection.
            </p>
            <button
              type="button"
              onClick={() => void loadWhatsApp()}
              className="mt-3 text-sm font-semibold text-[var(--zeno-primary)]"
            >
              Refresh connection status
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void createCode()}
            className="mt-4 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--zeno-primary-deep)] disabled:opacity-50"
          >
            {busy ? "Creating code…" : "Connect WhatsApp"}
          </button>
        )}
      </section>
      <section className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Telegram</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--zeno-ink-muted)]">
              Receive proactive job alerts and open your Zeno workspaces from a
              private Telegram chat with the Zeno bot.
            </p>
          </div>
          {telegram?.connected ? (
            <span className="rounded-full bg-[var(--zeno-success-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--zeno-success)]">
              {telegram.optedIn ? "Alerts on" : "Alerts paused"}
            </span>
          ) : null}
        </div>

        {telegramError ? (
          <p className="mt-4 text-sm text-[var(--zeno-danger)]" role="alert">
            {telegramError}
          </p>
        ) : null}

        {!telegram ? (
          <p className="mt-4 text-sm text-[var(--zeno-ink-muted)]">Loading…</p>
        ) : !telegram.enabled ? (
          <p className="mt-4 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-warning-soft)] p-3 text-sm text-[var(--zeno-warning)]">
            Telegram is not configured for this Zeno deployment yet.
          </p>
        ) : telegram.connected ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-bg)] p-4">
            <div>
              <p className="text-sm font-semibold">
                Connected {telegram.displayName}
              </p>
              <p className="mt-1 text-xs text-[var(--zeno-ink-muted)]">
                Send /help to the Zeno bot to see available commands.
              </p>
            </div>
            <button
              type="button"
              disabled={telegramBusy}
              onClick={() => void disconnectTelegram()}
              className="rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-3 py-2 text-sm font-semibold hover:border-[var(--zeno-border-hover)] disabled:opacity-50"
            >
              Disconnect
            </button>
          </div>
        ) : telegramCode ? (
          <div className="mt-4 rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] p-4">
            <p className="text-sm font-semibold">Finish in Telegram</p>
            <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
              Open the bot and press Start. The secure link carries your
              one-time connection code automatically.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <a
                href={telegramCode.botUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-ink)] px-4 py-2 text-sm font-semibold text-white"
              >
                Open Telegram
              </a>
              <code className="rounded-md bg-[var(--zeno-bg)] px-3 py-2 text-xs font-semibold tracking-[0.08em]">
                {telegramCode.code}
              </code>
            </div>
            <p className="mt-3 text-xs text-[var(--zeno-ink-muted)]">
              This link expires at{" "}
              {new Date(telegramCode.expiresAt).toLocaleTimeString()}.
            </p>
            <button
              type="button"
              onClick={() => void loadTelegram()}
              className="mt-3 text-sm font-semibold text-[var(--zeno-primary)]"
            >
              Refresh connection status
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={telegramBusy}
            onClick={() => void createTelegramCode()}
            className="mt-4 rounded-[var(--zeno-radius-sm)] bg-[var(--zeno-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--zeno-primary-deep)] disabled:opacity-50"
          >
            {telegramBusy ? "Creating link…" : "Connect Telegram"}
          </button>
        )}
      </section>
      <div className="rounded-[var(--zeno-radius-md)] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5">
        <h2 className="text-base font-semibold">Sign out</h2>
        <p className="mt-1 text-sm text-[var(--zeno-ink-muted)]">
          You can sign back in anytime with the same email.
        </p>
        <button
          type="button"
          onClick={signOut}
          className="mt-4 rounded-[var(--zeno-radius-sm)] border border-[var(--zeno-border)] px-4 py-2 text-sm font-semibold hover:border-[var(--zeno-border-hover)]"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
