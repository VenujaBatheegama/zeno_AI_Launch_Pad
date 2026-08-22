"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ManualApplicationModal(props: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [roleTitle, setRoleTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [applicationUrl, setApplicationUrl] = useState("");
  const [status, setStatus] = useState<"applied" | "interview" | "offer" | "rejected">("applied");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [userNote, setUserNote] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!props.isOpen) return null;

  async function handleExtractUrl(urlToExtract?: string) {
    const target = (urlToExtract ?? applicationUrl).trim();
    if (!target) return;
    if (!/^https?:\/\//i.test(target)) {
      setError("Please enter a full URL starting with http:// or https://");
      return;
    }

    setExtracting(true);
    setError(null);
    try {
      const response = await fetch("/api/applications/extract-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        roleTitle?: string | null;
        companyName?: string | null;
        descriptionSnippet?: string | null;
        error?: string;
      };

      if (!response.ok || data.error) {
        setError(data.error ?? "Could not auto-fill details from this link.");
        return;
      }

      if (data.roleTitle) {
        setRoleTitle(data.roleTitle);
      }
      if (data.companyName) {
        setCompanyName(data.companyName);
      }
      if (data.descriptionSnippet && !userNote) {
        setUserNote(data.descriptionSnippet);
      }
      if (data.roleTitle || data.companyName) {
        setAutoFilled(true);
      }
    } catch {
      setError("Failed to fetch link preview. You can still enter details manually.");
    } finally {
      setExtracting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!roleTitle.trim() || !companyName.trim()) {
      setError("Please provide both Job Title and Company Name.");
      return;
    }
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/applications/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleTitle: roleTitle.trim(),
          companyName: companyName.trim(),
          applicationUrl: applicationUrl.trim() || null,
          status,
          appliedAt: status === "applied" ? new Date(date).toISOString() : new Date().toISOString(),
          interviewAt: status === "interview" ? new Date(date).toISOString() : null,
          userNote: userNote.trim() || null,
        }),
      });

      const data = (await response.json()) as { error?: string; applicationId?: string };
      if (!response.ok || data.error) {
        setError(data.error ?? "Failed to log application");
        return;
      }

      props.onClose();
      router.refresh();
    } catch {
      setError("Network issue. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg rounded-2xl border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-6 shadow-2xl space-y-5"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-[var(--zeno-border)] pb-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--zeno-ink)]">
              Track Job Application / Interview
            </h2>
            <p className="text-xs text-[var(--zeno-ink-muted)]">
              Paste a job link to auto-fill or enter the details manually.
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="text-[var(--zeno-ink-muted)] hover:text-[var(--zeno-ink)] p-1.5 rounded-lg hover:bg-[var(--zeno-surface-elevated)]"
          >
            ✕
          </button>
        </div>

        {error ? (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3.5 py-2 text-xs text-red-400">
            {error}
          </div>
        ) : null}

        {/* URL Auto-fill Section */}
        <div className="rounded-xl border border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] p-3 space-y-2">
          <label className="block text-xs font-semibold text-[var(--zeno-ink)]">
            🔗 Paste Job Link (LinkedIn, Greenhouse, Lever, etc.)
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://www.linkedin.com/jobs/view/..."
              value={applicationUrl}
              onChange={(e) => {
                setApplicationUrl(e.target.value);
                setAutoFilled(false);
              }}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text");
                if (/^https?:\/\//i.test(pasted.trim())) {
                  void handleExtractUrl(pasted.trim());
                }
              }}
              className="flex-1 rounded-xl border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-3 py-2 text-xs text-[var(--zeno-ink)] outline-none focus:border-[var(--zeno-primary)]"
            />
            <button
              type="button"
              disabled={extracting || !applicationUrl.trim()}
              onClick={() => void handleExtractUrl()}
              className="rounded-xl bg-[var(--zeno-primary)] hover:bg-[var(--zeno-primary-deep)] px-3.5 py-2 text-xs font-semibold text-white transition disabled:opacity-60 shadow-sm whitespace-nowrap"
            >
              {extracting ? "Extracting…" : "Auto-Fill 🪄"}
            </button>
          </div>
          {autoFilled ? (
            <p className="text-[11px] font-medium text-emerald-400">
              ✨ Auto-filled job title and company from link!
            </p>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-[var(--zeno-ink)] mb-1">
                Job Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Senior DevOps Engineer"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                className="w-full rounded-xl border border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] px-3 py-2 text-sm text-[var(--zeno-ink)] outline-none focus:border-[var(--zeno-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--zeno-ink)] mb-1">
                Company Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Stripe, Acme Corp"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full rounded-xl border border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] px-3 py-2 text-sm text-[var(--zeno-ink)] outline-none focus:border-[var(--zeno-primary)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--zeno-ink)] mb-1">
              Current Stage
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { key: "applied", label: "✉️ Applied" },
                { key: "interview", label: "🎙️ Interview" },
                { key: "offer", label: "🎉 Offer" },
                { key: "rejected", label: "❌ Rejected" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setStatus(item.key as typeof status)}
                  className={`rounded-xl border py-2 text-xs font-medium transition ${
                    status === item.key
                      ? "border-[var(--zeno-primary)] bg-[var(--zeno-violet-soft)] text-[var(--zeno-primary-deep)] font-semibold shadow-sm"
                      : "border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] text-[var(--zeno-ink-muted)] hover:border-[var(--zeno-border-hover)]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--zeno-ink)] mb-1">
              {status === "interview" ? "Interview Date" : "Date Applied"}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] px-3 py-2 text-sm text-[var(--zeno-ink)] outline-none focus:border-[var(--zeno-primary)]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--zeno-ink)] mb-1">
              Personal Notes or Contacts (Optional)
            </label>
            <textarea
              rows={2}
              maxLength={1000}
              placeholder="e.g. Recruiter is Jane, next round on Friday..."
              value={userNote}
              onChange={(e) => setUserNote(e.target.value)}
              className="w-full rounded-xl border border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] px-3 py-2 text-sm text-[var(--zeno-ink)] outline-none focus:border-[var(--zeno-primary)] resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--zeno-border)]">
            <button
              type="button"
              onClick={props.onClose}
              className="rounded-xl border border-[var(--zeno-border)] px-4 py-2 text-xs font-semibold text-[var(--zeno-ink)] hover:bg-[var(--zeno-surface-elevated)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || extracting}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--zeno-primary)] hover:bg-[var(--zeno-primary-deep)] px-5 py-2 text-xs font-semibold text-white shadow-sm transition disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save to Pipeline"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
