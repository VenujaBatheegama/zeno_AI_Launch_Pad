"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  CareerEvidence,
  CareerEvidenceSet,
} from "../domain/evidence";
import { UploadForm } from "./upload-form";

type Props = {
  initialEvidenceSet: CareerEvidenceSet | null;
  handoff?: CareerProfileHandoff | null;
  onboardingMode?: boolean;
};

type ConfirmationMap = Record<string, boolean>;

export type CareerProfileHandoff = {
  title: string;
  objective: string;
  expectedEvidence: string[];
  startDate: string | null;
  endDate: string | null;
};

/**
 * Card-based career profile editor — experience, projects, education, skills,
 * certifications, and referees — with inline Edit / Confirm / Remove.
 */
export function CareerProfileView({
  initialEvidenceSet,
  handoff,
  onboardingMode = false,
}: Props) {
  const [evidenceSet, setEvidenceSet] = useState(initialEvidenceSet);
  const [showUpdateFromCv, setShowUpdateFromCv] = useState(false);

  if (!evidenceSet) {
    return (
      <div className="space-y-6">
        {!onboardingMode ? <ProfileHeader /> : null}
        <div className="rounded-[16px] border border-dashed border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-6 py-12 text-center">
          <p className="text-[15px] font-semibold text-[var(--zeno-ink)]">
            No career evidence yet
          </p>
          <p className="mt-2 text-sm text-[var(--zeno-ink-muted)]">
            Start by importing a CV, then review and confirm what Zeno can use.
          </p>
          <div className="mx-auto mt-5 max-w-lg text-left">
            <UploadForm
              onUploaded={setEvidenceSet}
              title="Import CV"
              description="PDF or DOCX up to 10 MB."
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!onboardingMode ? <ProfileHeader /> : null}
      <ProfileOverview
        key={`${evidenceSet.id}-${evidenceSet.updatedAt}`}
        evidenceSet={evidenceSet}
        onChanged={setEvidenceSet}
        onUpdateFromCv={() => setShowUpdateFromCv((open) => !open)}
        updateFromCvOpen={showUpdateFromCv}
        handoff={handoff}
        onboardingMode={onboardingMode}
      />
      {showUpdateFromCv ? (
        <UploadForm
          onUploaded={(next) => {
            setEvidenceSet(next);
            setShowUpdateFromCv(false);
          }}
          title="Update profile from CV"
          description="This replaces your current draft with a fresh extraction. Review before verifying."
        />
      ) : null}
    </div>
  );
}

function ProfileHeader() {
  return (
    <header className="max-w-2xl">
      <h1 className="font-[family-name:var(--zeno-font-display)] text-[2.35rem] leading-none tracking-[-0.03em] text-[var(--zeno-ink)]">
        Career profile
      </h1>
      <p className="mt-3 text-[14px] leading-relaxed text-[var(--zeno-ink-muted)]">
        Zeno only claims what you confirm here. Everything else stays flagged as
        unconfirmed.
      </p>
    </header>
  );
}

function ProfileOverview({
  evidenceSet,
  onChanged,
  onUpdateFromCv,
  updateFromCvOpen,
  handoff,
  onboardingMode = false,
}: {
  evidenceSet: CareerEvidenceSet;
  onChanged: (next: CareerEvidenceSet) => void;
  onUpdateFromCv: () => void;
  updateFromCvOpen: boolean;
  handoff?: CareerProfileHandoff | null;
  onboardingMode?: boolean;
}) {
  const router = useRouter();
  const [evidence, setEvidence] = useState(evidenceSet.evidence);
  const evidenceRef = useRef(evidence);
  evidenceRef.current = evidence;
  const dirtyRef = useRef(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmations, setConfirmations] = useState<ConfirmationMap>(() =>
    buildInitialConfirmations(evidenceSet.evidence, evidenceSet.status === "verified"),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isVerified = evidenceSet.status === "verified";
  // Profile stays editable after verify — first save reopens as draft.
  const locked = false;

  const stats = useMemo(
    () => profileStats(evidence, confirmations, isVerified),
    [evidence, confirmations, isVerified],
  );

  const headline = useMemo(() => {
    const current =
      evidence.work_experience.find((item) => item.is_current) ??
      evidence.work_experience[0];
    const role = current?.role?.trim() || null;
    const location = evidence.profile.location?.trim() || null;
    return [role, location].filter(Boolean).join(" · ") || "Add your current role";
  }, [evidence]);

  function commit(next: CareerEvidence) {
    dirtyRef.current = true;
    evidenceRef.current = next;
    setEvidence(next);
  }

  function addHandoffProject() {
    if (!handoff) return;
    if (evidence.projects.some((item) => item.name === handoff.title)) {
      const existing = evidence.projects.find((item) => item.name === handoff.title);
      if (existing) setEditingId(existing.id);
      return;
    }
    const id = crypto.randomUUID();
    commit({
      ...evidence,
      projects: [
        ...evidence.projects,
        {
          id,
          origin: "user_edited",
          source_quote: null,
          name: handoff.title,
          role: null,
          start_date: handoff.startDate?.slice(0, 7) ?? null,
          end_date: handoff.endDate?.slice(0, 7) ?? null,
          bullets: [
            handoff.objective,
            ...handoff.expectedEvidence,
          ].filter(Boolean),
          technologies: [],
        },
      ],
    });
    setConfirmations((current) => ({ ...current, [id]: false }));
    setEditingId(id);
  }

  function setConfirmed(id: string, value: boolean) {
    setConfirmations((current) => ({ ...current, [id]: value }));
  }

  function isConfirmed(id: string): boolean {
    return confirmations[id] === true;
  }

  async function persist(
    action: "save" | "verify",
    options?: { quiet?: boolean; nextEvidence?: CareerEvidence },
  ) {
    setIsSaving(true);
    if (!options?.quiet) setMessage(null);
    try {
      const payload = options?.nextEvidence ?? evidenceRef.current;

      if (action === "verify" && onboardingMode) {
        const response = await fetch("/api/onboarding/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ evidence: payload }),
        });
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error ?? "Could not verify profile.");
        }
        dirtyRef.current = false;
        router.push("/app/home");
        router.refresh();
        return;
      }

      const response = await fetch(
        `/api/evidence/${evidenceSet.id}${action === "verify" ? "/verify" : ""}`,
        {
          method: action === "verify" ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            evidence: payload,
            acknowledged: true,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "The evidence could not be saved.");
      }
      const updated = body as CareerEvidenceSet;
      dirtyRef.current = false;
      evidenceRef.current = updated.evidence;
      // Do not overwrite local evidence state with server snapshot while the user is actively typing in an open card
      if (!editingId) {
        setEvidence(updated.evidence);
      }
      if (action === "verify" || updated.status === "verified") {
        setConfirmations(
          buildInitialConfirmations(updated.evidence, true),
        );
        setEditingId(null);
      } else {
        setConfirmations((current) =>
          mergeConfirmations(current, updated.evidence),
        );
      }
      onChanged(updated);
      if (!options?.quiet) {
        setMessage(
          action === "verify"
            ? "Career evidence verified and persisted."
            : "Draft saved.",
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The evidence could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const autosaveDraft = useEffectEvent(() => {
    if (!dirtyRef.current) return;
    void persist("save", { quiet: true });
  });

  useEffect(() => {
    if (!dirtyRef.current) return;
    const timer = window.setTimeout(() => {
      autosaveDraft();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [evidence]);

  function finishEditing() {
    setEditingId(null);
    if (dirtyRef.current) {
      void persist("save", { quiet: true });
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[16px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-5 py-4 shadow-[var(--zeno-shadow-sm)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {editingId === "profile" && !locked ? (
              <div className="grid max-w-xl gap-2">
                <input
                  value={evidence.profile.full_name ?? ""}
                  onChange={(event) =>
                    commit({
                      ...evidence,
                      profile: {
                        ...evidence.profile,
                        full_name: event.target.value || null,
                      },
                    })
                  }
                  placeholder="Full name"
                  className="h-9 rounded-[8px] border border-[var(--zeno-border)] px-3 text-[14px] font-semibold"
                />
                <input
                  value={evidence.profile.location ?? ""}
                  onChange={(event) =>
                    commit({
                      ...evidence,
                      profile: {
                        ...evidence.profile,
                        location: event.target.value || null,
                      },
                    })
                  }
                  placeholder="Location"
                  className="h-9 rounded-[8px] border border-[var(--zeno-border)] px-3 text-[13px]"
                />
                <button
                  type="button"
                  onClick={finishEditing}
                  className="w-fit text-[12px] font-semibold text-[var(--zeno-primary)]"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <p className="text-[18px] font-semibold text-[var(--zeno-ink)]">
                  {evidence.profile.full_name?.trim() || "Your name"}
                </p>
                <p className="mt-1 text-[13px] text-[var(--zeno-ink-muted)]">
                  {headline}
                </p>
                {!locked ? (
                  <button
                    type="button"
                    onClick={() => setEditingId("profile")}
                    className="mt-2 text-[12px] font-semibold text-[var(--zeno-primary)] hover:underline"
                  >
                    Edit profile
                  </button>
                ) : null}
              </>
            )}
          </div>
          <div className="w-full max-w-[260px]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-medium text-[var(--zeno-ink-muted)]">
                Profile confidence
              </p>
              <span className="rounded-full bg-[var(--zeno-violet-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--zeno-primary-deep)]">
                {stats.verifiedCount} verified item
                {stats.verifiedCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--zeno-surface-sunken)]">
                <div
                  className="h-full rounded-full bg-[var(--zeno-primary)] transition-[width]"
                  style={{ width: `${stats.confidence}%` }}
                />
              </div>
              <span className="text-[12px] font-semibold text-[var(--zeno-primary-deep)]">
                {stats.confidence}%
              </span>
            </div>
          </div>
        </div>
      </section>

      {message ? (
        <p className="rounded-[10px] bg-[var(--zeno-success-soft)] px-3 py-2 text-sm text-[var(--zeno-success)]">
          {message}
        </p>
      ) : null}

      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
        <ProfileSection
          title="Experience"
          locked={locked}
          onAdd={() => {
            const id = crypto.randomUUID();
            commit({
              ...evidence,
              work_experience: [
                ...evidence.work_experience,
                {
                  id,
                  origin: "user_edited",
                  source_quote: null,
                  employer: "",
                  role: "",
                  location: null,
                  start_date: null,
                  end_date: null,
                  is_current: false,
                  bullets: [],
                },
              ],
            });
            setConfirmations((current) => ({ ...current, [id]: false }));
            setEditingId(id);
          }}
        >
          {evidence.work_experience.length === 0 ? (
            <EmptyCard label="No experience yet." />
          ) : (
            evidence.work_experience.map((item, index) => {
              const editing = editingId === item.id;
              const confirmed = isConfirmed(item.id);
              return (
                <ItemCard
                  key={item.id}
                  title={item.role || "Untitled role"}
                  subtitle={[
                    item.employer,
                    formatDateRange(
                      item.start_date,
                      item.end_date,
                      item.is_current,
                    ),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  body={
                    item.bullets.slice(0, 3).join(" ") || "No description yet."
                  }
                  confirmed={confirmed}
                  locked={locked}
                  editing={editing}
                  onEdit={() => {
                    if (editing) finishEditing();
                    else setEditingId(item.id);
                  }}
                  onConfirm={() => setConfirmed(item.id, true)}
                  onUnconfirm={() => setConfirmed(item.id, false)}
                  onDuplicate={() => {
                    const id = crypto.randomUUID();
                    commit({
                      ...evidence,
                      work_experience: [
                        ...evidence.work_experience.slice(0, index + 1),
                        {
                          ...item,
                          id,
                          origin: "user_edited",
                          source_quote: null,
                        },
                        ...evidence.work_experience.slice(index + 1),
                      ],
                    });
                    setConfirmations((current) => ({ ...current, [id]: false }));
                  }}
                  onRemove={() => {
                    commit({
                      ...evidence,
                      work_experience: evidence.work_experience.filter(
                        (_, i) => i !== index,
                      ),
                    });
                    setEditingId((current) =>
                      current === item.id ? null : current,
                    );
                  }}
                >
                  {editing && !locked ? (
                    <div className="mt-3 space-y-2">
                      <Field
                        value={item.role}
                        placeholder="Role"
                        onChange={(role) =>
                          commit({
                            ...evidence,
                            work_experience: evidence.work_experience.map(
                              (entry, i) =>
                                i === index
                                  ? {
                                      ...entry,
                                      role,
                                      origin: "user_edited",
                                      source_quote: null,
                                    }
                                  : entry,
                            ),
                          })
                        }
                      />
                      <Field
                        value={item.employer}
                        placeholder="Company"
                        onChange={(employer) =>
                          commit({
                            ...evidence,
                            work_experience: evidence.work_experience.map(
                              (entry, i) =>
                                i === index
                                  ? {
                                      ...entry,
                                      employer,
                                      origin: "user_edited",
                                      source_quote: null,
                                    }
                                  : entry,
                            ),
                          })
                        }
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Field
                          value={item.start_date ?? ""}
                          placeholder="Start YYYY or YYYY-MM"
                          onChange={(start_date) =>
                            commit({
                              ...evidence,
                              work_experience: evidence.work_experience.map(
                                (entry, i) =>
                                  i === index
                                    ? {
                                        ...entry,
                                        start_date: start_date || null,
                                        origin: "user_edited",
                                        source_quote: null,
                                      }
                                    : entry,
                              ),
                            })
                          }
                        />
                        <Field
                          value={item.end_date ?? ""}
                          placeholder="End YYYY or YYYY-MM"
                          onChange={(end_date) =>
                            commit({
                              ...evidence,
                              work_experience: evidence.work_experience.map(
                                (entry, i) =>
                                  i === index
                                    ? {
                                        ...entry,
                                        end_date: end_date || null,
                                        origin: "user_edited",
                                        source_quote: null,
                                      }
                                    : entry,
                              ),
                            })
                          }
                        />
                      </div>
                      <label className="flex items-center gap-2 text-[12px] text-[var(--zeno-ink-muted)]">
                        <input
                          type="checkbox"
                          checked={item.is_current}
                          onChange={(event) =>
                            commit({
                              ...evidence,
                              work_experience: evidence.work_experience.map(
                                (entry, i) =>
                                  i === index
                                    ? {
                                        ...entry,
                                        is_current: event.target.checked,
                                        end_date: event.target.checked
                                          ? null
                                          : entry.end_date,
                                        origin: "user_edited",
                                        source_quote: null,
                                      }
                                    : entry,
                              ),
                            })
                          }
                        />
                        Current role
                      </label>
                      <Area
                        value={item.bullets.join("\n")}
                        placeholder="Responsibilities (one per line)"
                        onChange={(text) =>
                          commit({
                            ...evidence,
                            work_experience: evidence.work_experience.map(
                              (entry, i) =>
                                i === index
                                  ? {
                                      ...entry,
                                      bullets: lines(text),
                                      origin: "user_edited",
                                      source_quote: null,
                                    }
                                  : entry,
                            ),
                          })
                        }
                      />
                    </div>
                  ) : null}
                </ItemCard>
              );
            })
          )}
        </ProfileSection>

        {handoff ? (
          <div className="rounded-[12px] border border-dashed border-[var(--zeno-border-hover)] bg-[var(--zeno-surface)] px-4 py-3">
            <p className="text-[13px] text-[var(--zeno-ink-muted)]">
              Prefill an unverified project from your completed Growth work. You still need to
              review and confirm every claim.
            </p>
            <button
              type="button"
              onClick={addHandoffProject}
              className="mt-2 inline-flex h-9 items-center rounded-[10px] border border-[var(--zeno-border)] px-3 text-[13px] font-semibold text-[var(--zeno-ink)]"
            >
              Add “{handoff.title}” as a draft project
            </button>
          </div>
        ) : null}

        <ProfileSection
          title="Projects"
          locked={locked}
          onAdd={() => {
            const id = crypto.randomUUID();
            commit({
              ...evidence,
              projects: [
                ...evidence.projects,
                {
                  id,
                  origin: "user_edited",
                  source_quote: null,
                  name: "",
                  role: null,
                  start_date: null,
                  end_date: null,
                  bullets: [],
                  technologies: [],
                },
              ],
            });
            setConfirmations((current) => ({ ...current, [id]: false }));
            setEditingId(id);
          }}
        >
          {evidence.projects.length === 0 ? (
            <EmptyCard label="No projects yet." />
          ) : (
            evidence.projects.map((item, index) => {
              const editing = editingId === item.id;
              const confirmed = isConfirmed(item.id);
              const year =
                item.end_date?.slice(0, 4) ||
                item.start_date?.slice(0, 4) ||
                null;
              return (
                <ItemCard
                  key={item.id}
                  title={item.name || "Untitled project"}
                  subtitle={[item.role || "Project", year]
                    .filter(Boolean)
                    .join(" · ")}
                  body={
                    [
                      item.bullets.slice(0, 2).join(" "),
                      item.technologies.length > 0
                        ? `Tech: ${item.technologies.slice(0, 6).join(", ")}.`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ") || "No description yet."
                  }
                  confirmed={confirmed}
                  locked={locked}
                  editing={editing}
                  onEdit={() => {
                    if (editing) finishEditing();
                    else setEditingId(item.id);
                  }}
                  onConfirm={() => setConfirmed(item.id, true)}
                  onUnconfirm={() => setConfirmed(item.id, false)}
                  onDuplicate={() => {
                    const id = crypto.randomUUID();
                    commit({
                      ...evidence,
                      projects: [
                        ...evidence.projects.slice(0, index + 1),
                        {
                          ...item,
                          id,
                          origin: "user_edited",
                          source_quote: null,
                        },
                        ...evidence.projects.slice(index + 1),
                      ],
                    });
                    setConfirmations((current) => ({ ...current, [id]: false }));
                  }}
                  onRemove={() => {
                    commit({
                      ...evidence,
                      projects: evidence.projects.filter((_, i) => i !== index),
                    });
                    setEditingId((current) =>
                      current === item.id ? null : current,
                    );
                  }}
                >
                  {editing && !locked ? (
                    <div className="mt-3 space-y-2">
                      <Field
                        value={item.name}
                        placeholder="Project name"
                        onChange={(name) =>
                          commit({
                            ...evidence,
                            projects: evidence.projects.map((entry, i) =>
                              i === index
                                ? {
                                    ...entry,
                                    name,
                                    origin: "user_edited",
                                    source_quote: null,
                                  }
                                : entry,
                            ),
                          })
                        }
                      />
                      <Field
                        value={item.role ?? ""}
                        placeholder="Role"
                        onChange={(role) =>
                          commit({
                            ...evidence,
                            projects: evidence.projects.map((entry, i) =>
                              i === index
                                ? {
                                    ...entry,
                                    role: role || null,
                                    origin: "user_edited",
                                    source_quote: null,
                                  }
                                : entry,
                            ),
                          })
                        }
                      />
                      <Area
                        value={item.bullets.join("\n")}
                        placeholder="Description (one per line)"
                        onChange={(text) =>
                          commit({
                            ...evidence,
                            projects: evidence.projects.map((entry, i) =>
                              i === index
                                ? {
                                    ...entry,
                                    bullets: lines(text),
                                    origin: "user_edited",
                                    source_quote: null,
                                  }
                                : entry,
                            ),
                          })
                        }
                      />
                      <Field
                        value={item.technologies.join(", ")}
                        placeholder="Technologies (comma separated)"
                        onChange={(text) =>
                          commit({
                            ...evidence,
                            projects: evidence.projects.map((entry, i) =>
                              i === index
                                ? {
                                    ...entry,
                                    technologies: commas(text),
                                    origin: "user_edited",
                                    source_quote: null,
                                  }
                                : entry,
                            ),
                          })
                        }
                      />
                    </div>
                  ) : null}
                </ItemCard>
              );
            })
          )}
        </ProfileSection>

        <ProfileSection
          title="Education"
          locked={locked}
          onAdd={() => {
            const id = crypto.randomUUID();
            commit({
              ...evidence,
              education: [
                ...evidence.education,
                {
                  id,
                  origin: "user_edited",
                  source_quote: null,
                  institution: "",
                  qualification: null,
                  field_of_study: null,
                  start_date: null,
                  end_date: null,
                },
              ],
            });
            setConfirmations((current) => ({ ...current, [id]: false }));
            setEditingId(id);
          }}
        >
          {evidence.education.length === 0 ? (
            <EmptyCard label="No education yet." />
          ) : (
            evidence.education.map((item, index) => {
              const editing = editingId === item.id;
              const confirmed = isConfirmed(item.id);
              return (
                <ItemCard
                  key={item.id}
                  title={
                    item.qualification || item.institution || "Untitled education"
                  }
                  subtitle={[
                    item.institution,
                    item.field_of_study,
                    formatDateRange(item.start_date, item.end_date, false),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  body={
                    (item.details ?? []).slice(0, 2).join(" ") ||
                    "No details yet."
                  }
                  confirmed={confirmed}
                  locked={locked}
                  editing={editing}
                  onEdit={() => {
                    if (editing) finishEditing();
                    else setEditingId(item.id);
                  }}
                  onConfirm={() => setConfirmed(item.id, true)}
                  onUnconfirm={() => setConfirmed(item.id, false)}
                  onDuplicate={() => {
                    const id = crypto.randomUUID();
                    commit({
                      ...evidence,
                      education: [
                        ...evidence.education.slice(0, index + 1),
                        {
                          ...item,
                          id,
                          origin: "user_edited",
                          source_quote: null,
                        },
                        ...evidence.education.slice(index + 1),
                      ],
                    });
                    setConfirmations((current) => ({ ...current, [id]: false }));
                  }}
                  onRemove={() => {
                    commit({
                      ...evidence,
                      education: evidence.education.filter((_, i) => i !== index),
                    });
                    setEditingId((current) =>
                      current === item.id ? null : current,
                    );
                  }}
                >
                  {editing && !locked ? (
                    <div className="mt-3 space-y-2">
                      <Field
                        value={item.institution}
                        placeholder="Institution"
                        onChange={(institution) =>
                          commit({
                            ...evidence,
                            education: evidence.education.map((entry, i) =>
                              i === index
                                ? {
                                    ...entry,
                                    institution,
                                    origin: "user_edited",
                                    source_quote: null,
                                  }
                                : entry,
                            ),
                          })
                        }
                      />
                      <Field
                        value={item.qualification ?? ""}
                        placeholder="Qualification"
                        onChange={(qualification) =>
                          commit({
                            ...evidence,
                            education: evidence.education.map((entry, i) =>
                              i === index
                                ? {
                                    ...entry,
                                    qualification: qualification || null,
                                    origin: "user_edited",
                                    source_quote: null,
                                  }
                                : entry,
                            ),
                          })
                        }
                      />
                      <Field
                        value={item.field_of_study ?? ""}
                        placeholder="Field of study"
                        onChange={(field_of_study) =>
                          commit({
                            ...evidence,
                            education: evidence.education.map((entry, i) =>
                              i === index
                                ? {
                                    ...entry,
                                    field_of_study: field_of_study || null,
                                    origin: "user_edited",
                                    source_quote: null,
                                  }
                                : entry,
                            ),
                          })
                        }
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Field
                          value={item.start_date ?? ""}
                          placeholder="Start YYYY or YYYY-MM"
                          onChange={(start_date) =>
                            commit({
                              ...evidence,
                              education: evidence.education.map((entry, i) =>
                                i === index
                                  ? {
                                      ...entry,
                                      start_date: start_date || null,
                                      origin: "user_edited",
                                      source_quote: null,
                                    }
                                  : entry,
                              ),
                            })
                          }
                        />
                        <Field
                          value={item.end_date ?? ""}
                          placeholder="End YYYY or YYYY-MM"
                          onChange={(end_date) =>
                            commit({
                              ...evidence,
                              education: evidence.education.map((entry, i) =>
                                i === index
                                  ? {
                                      ...entry,
                                      end_date: end_date || null,
                                      origin: "user_edited",
                                      source_quote: null,
                                    }
                                  : entry,
                              ),
                            })
                          }
                        />
                      </div>
                      <Area
                        value={(item.details ?? []).join("\n")}
                        placeholder="Details (one per line)"
                        onChange={(text) =>
                          commit({
                            ...evidence,
                            education: evidence.education.map((entry, i) =>
                              i === index
                                ? {
                                    ...entry,
                                    details: lines(text),
                                    origin: "user_edited",
                                    source_quote: null,
                                  }
                                : entry,
                            ),
                          })
                        }
                      />
                    </div>
                  ) : null}
                </ItemCard>
              );
            })
          )}
        </ProfileSection>

        <ProfileSection
          title="Skills"
          locked={locked}
          onAdd={() => {
            const id = crypto.randomUUID();
            commit({
              ...evidence,
              skills: [
                ...evidence.skills,
                {
                  id,
                  origin: "user_edited",
                  source_quote: null,
                  name: "",
                },
              ],
            });
            setConfirmations((current) => ({ ...current, [id]: false }));
            setEditingId(id);
          }}
        >
          {evidence.skills.length === 0 ? (
            <EmptyCard label="No skills yet." />
          ) : (
            evidence.skills.map((item, index) => {
              const editing = editingId === item.id;
              const confirmed = isConfirmed(item.id);
              return (
                <ItemCard
                  key={item.id}
                  title={item.name || "Untitled skill"}
                  subtitle={confirmed ? "Confirmed skill" : "Needs confirmation"}
                  body={item.source_quote ? `From CV: “${item.source_quote}”` : ""}
                  confirmed={confirmed}
                  locked={locked}
                  editing={editing}
                  onEdit={() => {
                    if (editing) finishEditing();
                    else setEditingId(item.id);
                  }}
                  onConfirm={() => setConfirmed(item.id, true)}
                  onUnconfirm={() => setConfirmed(item.id, false)}
                  onDuplicate={() => {
                    const id = crypto.randomUUID();
                    commit({
                      ...evidence,
                      skills: [
                        ...evidence.skills.slice(0, index + 1),
                        {
                          ...item,
                          id,
                          origin: "user_edited",
                          source_quote: null,
                        },
                        ...evidence.skills.slice(index + 1),
                      ],
                    });
                    setConfirmations((current) => ({ ...current, [id]: false }));
                  }}
                  onRemove={() => {
                    commit({
                      ...evidence,
                      skills: evidence.skills.filter((_, i) => i !== index),
                    });
                    setEditingId((current) =>
                      current === item.id ? null : current,
                    );
                  }}
                >
                  {editing && !locked ? (
                    <div className="mt-3">
                      <Field
                        value={item.name}
                        placeholder="Skill name"
                        onChange={(name) =>
                          commit({
                            ...evidence,
                            skills: evidence.skills.map((entry, i) =>
                              i === index
                                ? {
                                    ...entry,
                                    name,
                                    origin: "user_edited",
                                    source_quote: null,
                                  }
                                : entry,
                            ),
                          })
                        }
                      />
                    </div>
                  ) : null}
                </ItemCard>
              );
            })
          )}
        </ProfileSection>

        <ProfileSection
          title="Certifications"
          locked={locked}
          onAdd={() => {
            const id = crypto.randomUUID();
            commit({
              ...evidence,
              certifications: [
                ...evidence.certifications,
                {
                  id,
                  origin: "user_edited",
                  source_quote: null,
                  name: "",
                  issuer: null,
                  issued_date: null,
                },
              ],
            });
            setConfirmations((current) => ({ ...current, [id]: false }));
            setEditingId(id);
          }}
        >
          {evidence.certifications.length === 0 ? (
            <EmptyCard label="No certifications yet." />
          ) : (
            evidence.certifications.map((item, index) => {
              const editing = editingId === item.id;
              const confirmed = isConfirmed(item.id);
              return (
                <ItemCard
                  key={item.id}
                  title={item.name || "Untitled certification"}
                  subtitle={[item.issuer, item.issued_date]
                    .filter(Boolean)
                    .join(" · ")}
                  body=""
                  confirmed={confirmed}
                  locked={locked}
                  editing={editing}
                  onEdit={() => {
                    if (editing) finishEditing();
                    else setEditingId(item.id);
                  }}
                  onConfirm={() => setConfirmed(item.id, true)}
                  onUnconfirm={() => setConfirmed(item.id, false)}
                  onDuplicate={() => {
                    const id = crypto.randomUUID();
                    commit({
                      ...evidence,
                      certifications: [
                        ...evidence.certifications.slice(0, index + 1),
                        {
                          ...item,
                          id,
                          origin: "user_edited",
                          source_quote: null,
                        },
                        ...evidence.certifications.slice(index + 1),
                      ],
                    });
                    setConfirmations((current) => ({ ...current, [id]: false }));
                  }}
                  onRemove={() => {
                    commit({
                      ...evidence,
                      certifications: evidence.certifications.filter(
                        (_, i) => i !== index,
                      ),
                    });
                    setEditingId((current) =>
                      current === item.id ? null : current,
                    );
                  }}
                >
                  {editing && !locked ? (
                    <div className="mt-3 space-y-2">
                      <Field
                        value={item.name}
                        placeholder="Certification"
                        onChange={(name) =>
                          commit({
                            ...evidence,
                            certifications: evidence.certifications.map(
                              (entry, i) =>
                                i === index
                                  ? {
                                      ...entry,
                                      name,
                                      origin: "user_edited",
                                      source_quote: null,
                                    }
                                  : entry,
                            ),
                          })
                        }
                      />
                      <Field
                        value={item.issuer ?? ""}
                        placeholder="Issuer"
                        onChange={(issuer) =>
                          commit({
                            ...evidence,
                            certifications: evidence.certifications.map(
                              (entry, i) =>
                                i === index
                                  ? {
                                      ...entry,
                                      issuer: issuer || null,
                                      origin: "user_edited",
                                      source_quote: null,
                                    }
                                  : entry,
                            ),
                          })
                        }
                      />
                      <Field
                        value={item.issued_date ?? ""}
                        placeholder="Issued YYYY or YYYY-MM"
                        onChange={(issued_date) =>
                          commit({
                            ...evidence,
                            certifications: evidence.certifications.map(
                              (entry, i) =>
                                i === index
                                  ? {
                                      ...entry,
                                      issued_date: issued_date || null,
                                      origin: "user_edited",
                                      source_quote: null,
                                    }
                                  : entry,
                            ),
                          })
                        }
                      />
                    </div>
                  ) : null}
                </ItemCard>
              );
            })
          )}
        </ProfileSection>

        <ProfileSection
          title="Referees"
          locked={locked}
          onAdd={() => {
            const id = crypto.randomUUID();
            commit({
              ...evidence,
              references: [
                ...(evidence.references ?? []),
                {
                  id,
                  origin: "user_edited",
                  source_quote: null,
                  name: "",
                  title: null,
                  organization: null,
                  email: null,
                  phone: null,
                },
              ],
            });
            setConfirmations((current) => ({ ...current, [id]: false }));
            setEditingId(id);
          }}
        >
          {(evidence.references ?? []).length === 0 ? (
            <EmptyCard label="No referees yet." />
          ) : (
            (evidence.references ?? []).map((item, index) => {
              const editing = editingId === item.id;
              const confirmed = isConfirmed(item.id);
              return (
                <ItemCard
                  key={item.id}
                  title={item.name || "Untitled referee"}
                  subtitle={[item.title, item.organization]
                    .filter(Boolean)
                    .join(" · ")}
                  body={[item.email, item.phone].filter(Boolean).join(" · ")}
                  confirmed={confirmed}
                  locked={locked}
                  editing={editing}
                  onEdit={() => {
                    if (editing) finishEditing();
                    else setEditingId(item.id);
                  }}
                  onConfirm={() => setConfirmed(item.id, true)}
                  onUnconfirm={() => setConfirmed(item.id, false)}
                  onDuplicate={() => {
                    const id = crypto.randomUUID();
                    commit({
                      ...evidence,
                      references: [
                        ...(evidence.references ?? []).slice(0, index + 1),
                        {
                          ...item,
                          id,
                          origin: "user_edited",
                          source_quote: null,
                        },
                        ...(evidence.references ?? []).slice(index + 1),
                      ],
                    });
                    setConfirmations((current) => ({ ...current, [id]: false }));
                  }}
                  onRemove={() => {
                    commit({
                      ...evidence,
                      references: (evidence.references ?? []).filter(
                        (_, i) => i !== index,
                      ),
                    });
                    setEditingId((current) =>
                      current === item.id ? null : current,
                    );
                  }}
                >
                  {editing && !locked ? (
                    <div className="mt-3 space-y-2">
                      <Field
                        value={item.name}
                        placeholder="Name"
                        onChange={(name) =>
                          commit({
                            ...evidence,
                            references: (evidence.references ?? []).map(
                              (entry, i) =>
                                i === index
                                  ? {
                                      ...entry,
                                      name,
                                      origin: "user_edited",
                                      source_quote: null,
                                    }
                                  : entry,
                            ),
                          })
                        }
                      />
                      <Field
                        value={item.title ?? ""}
                        placeholder="Title"
                        onChange={(title) =>
                          commit({
                            ...evidence,
                            references: (evidence.references ?? []).map(
                              (entry, i) =>
                                i === index
                                  ? {
                                      ...entry,
                                      title: title || null,
                                      origin: "user_edited",
                                      source_quote: null,
                                    }
                                  : entry,
                            ),
                          })
                        }
                      />
                      <Field
                        value={item.organization ?? ""}
                        placeholder="Organization"
                        onChange={(organization) =>
                          commit({
                            ...evidence,
                            references: (evidence.references ?? []).map(
                              (entry, i) =>
                                i === index
                                  ? {
                                      ...entry,
                                      organization: organization || null,
                                      origin: "user_edited",
                                      source_quote: null,
                                    }
                                  : entry,
                            ),
                          })
                        }
                      />
                      <Field
                        value={item.email ?? ""}
                        placeholder="Email"
                        onChange={(email) =>
                          commit({
                            ...evidence,
                            references: (evidence.references ?? []).map(
                              (entry, i) =>
                                i === index
                                  ? {
                                      ...entry,
                                      email: email || null,
                                      origin: "user_edited",
                                      source_quote: null,
                                    }
                                  : entry,
                            ),
                          })
                        }
                      />
                      <Field
                        value={item.phone ?? ""}
                        placeholder="Phone"
                        onChange={(phone) =>
                          commit({
                            ...evidence,
                            references: (evidence.references ?? []).map(
                              (entry, i) =>
                                i === index
                                  ? {
                                      ...entry,
                                      phone: phone || null,
                                      origin: "user_edited",
                                      source_quote: null,
                                    }
                                  : entry,
                            ),
                          })
                        }
                      />
                    </div>
                  ) : null}
                </ItemCard>
              );
            })
          )}
        </ProfileSection>
      </div>

      <section className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-[16px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)]/95 backdrop-blur-md px-5 py-3.5 shadow-lg">
        {isVerified ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--zeno-success-soft)] px-2.5 py-1 text-[12px] font-semibold text-[var(--zeno-success)]">
            <span className="size-1.5 rounded-full bg-[var(--zeno-success)]" />
            Profile verified
          </span>
        ) : null}

        {onboardingMode ? (
          <>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void persist("verify")}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[var(--zeno-primary)] px-6 text-[14px] font-semibold text-white shadow-sm hover:bg-[var(--zeno-primary-deep)] transition disabled:opacity-60"
            >
              {isSaving ? (
                <>
                  <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  <span>Verifying profile…</span>
                </>
              ) : (
                "Verify and finish profile"
              )}
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void persist("save")}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-4 text-[13px] font-semibold text-[var(--zeno-ink-muted)] hover:border-[var(--zeno-border-hover)] hover:text-[var(--zeno-ink)] transition disabled:opacity-60"
            >
              {isSaving ? (
                <>
                  <svg className="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  <span>Saving…</span>
                </>
              ) : (
                "Save draft"
              )}
            </button>
          </>
        ) : (
          <>
            {!isVerified ? (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void persist("verify")}
                className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-[var(--zeno-primary)] px-4 text-[13px] font-semibold text-white shadow-sm hover:bg-[var(--zeno-primary-deep)] transition disabled:opacity-60"
              >
                {isSaving ? (
                  <>
                    <svg className="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    <span>Verifying…</span>
                  </>
                ) : (
                  "Verify profile"
                )}
              </button>
            ) : null}
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void persist("save")}
              className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-3 text-[13px] font-semibold text-[var(--zeno-ink)] hover:border-[var(--zeno-border-hover)] disabled:opacity-60 transition"
            >
              {isSaving ? (
                <>
                  <svg className="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  <span>Saving…</span>
                </>
              ) : isVerified ? (
                "Save changes"
              ) : (
                "Save draft"
              )}
            </button>
          </>
        )}

        {isSaving ? (
          <span className="flex items-center gap-1.5 text-xs text-[var(--zeno-ink-muted)]">
            <span className="size-1.5 animate-ping rounded-full bg-[var(--zeno-primary)]" />
            Syncing…
          </span>
        ) : message ? (
          <span className="text-xs text-[var(--zeno-ink-muted)]">{message}</span>
        ) : null}

        <button
          type="button"
          onClick={onUpdateFromCv}
          className="ml-auto text-[13px] font-semibold text-[var(--zeno-ink-muted)] hover:text-[var(--zeno-ink)] transition"
        >
          {updateFromCvOpen ? "Hide CV update" : "Update from CV"}
        </button>
      </section>
    </div>
  );
}

function ProfileSection({
  title,
  locked,
  onAdd,
  children,
}: {
  title: string;
  locked: boolean;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <section className="flex h-full min-h-[12rem] flex-col rounded-[16px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-4 shadow-[var(--zeno-shadow-sm)]">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--zeno-ink-faint)]">
          {title}
        </h2>
        {!locked ? (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex h-8 items-center rounded-[8px] border border-[var(--zeno-border)] px-3 text-[12px] font-semibold text-[var(--zeno-ink)] hover:bg-[var(--zeno-violet-wash)]"
          >
            Add
          </button>
        ) : null}
      </div>
      <ul className="flex min-h-0 flex-1 flex-col gap-3">{children}</ul>
    </section>
  );
}

function EmptyCard({ label }: { label: string }) {
  return (
    <li className="flex flex-1 items-center justify-center rounded-[12px] border border-dashed border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)]/20 px-4 py-8 text-center text-sm text-[var(--zeno-ink-muted)]">
      {label}
    </li>
  );
}

function ItemCard({
  title,
  subtitle,
  body,
  confirmed,
  locked,
  editing,
  onEdit,
  onConfirm,
  onUnconfirm,
  onDuplicate,
  onRemove,
  children,
}: {
  title: string;
  subtitle: string;
  body: string;
  confirmed: boolean;
  locked: boolean;
  editing: boolean;
  onEdit: () => void;
  onConfirm: () => void;
  onUnconfirm: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  children?: ReactNode;
}) {
  // onDuplicate kept in the props for call-site compatibility; unused in UI.
  void onDuplicate;

  return (
    <li className="rounded-[12px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)]/35 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[14px] font-semibold text-[var(--zeno-ink)]">{title}</p>
        <StatusBadge confirmed={confirmed} />
      </div>
      {subtitle ? (
        <p className="mt-1 text-[12px] text-[var(--zeno-ink-muted)]">{subtitle}</p>
      ) : null}
      {!editing && body ? (
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--zeno-ink)]">
          {body}
        </p>
      ) : null}
      {children}
      {!locked ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton onClick={onEdit}>{editing ? "Done" : "Edit"}</ActionButton>
          {!editing ? (
            confirmed ? (
              <ActionButton onClick={onUnconfirm}>Mark unconfirmed</ActionButton>
            ) : (
              <ActionButton onClick={onConfirm}>Confirm</ActionButton>
            )
          ) : null}
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex h-8 items-center rounded-[8px] px-2.5 text-[12px] font-semibold text-[var(--zeno-danger)] hover:bg-[var(--zeno-danger-soft)]"
          >
            Remove
          </button>
        </div>
      ) : null}
    </li>
  );
}

function StatusBadge({ confirmed }: { confirmed: boolean }) {
  return (
    <span
      className={`shrink-0 text-[11px] font-semibold ${
        confirmed ? "text-[var(--zeno-success)]" : "text-[var(--zeno-warning)]"
      }`}
    >
      {confirmed ? "Verified" : "Unconfirmed"}
    </span>
  );
}

function ActionButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center rounded-[8px] border border-[var(--zeno-border)] px-2.5 text-[12px] font-semibold text-[var(--zeno-ink)] hover:bg-[var(--zeno-violet-wash)]"
    >
      {children}
    </button>
  );
}

function Field({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-[8px] border border-[var(--zeno-border)] px-3 text-[13px]"
    />
  );
}

function Area({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      rows={3}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-[8px] border border-[var(--zeno-border)] px-3 py-2 text-[13px]"
    />
  );
}

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function commas(text: string): string[] {
  return text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function itemSeedConfirmed(item: {
  origin: string;
  source_quote: string | null;
}): boolean {
  return item.origin === "extracted" && Boolean(item.source_quote?.trim());
}

function allItems(evidence: CareerEvidence) {
  return [
    ...evidence.work_experience,
    ...evidence.projects,
    ...evidence.education,
    ...evidence.skills,
    ...evidence.certifications,
    ...(evidence.references ?? []),
  ];
}

function buildInitialConfirmations(
  evidence: CareerEvidence,
  setVerified: boolean,
): ConfirmationMap {
  const map: ConfirmationMap = {};
  for (const item of allItems(evidence)) {
    map[item.id] = setVerified || itemSeedConfirmed(item);
  }
  return map;
}

function mergeConfirmations(
  current: ConfirmationMap,
  evidence: CareerEvidence,
): ConfirmationMap {
  const next: ConfirmationMap = {};
  for (const item of allItems(evidence)) {
    next[item.id] =
      item.id in current ? Boolean(current[item.id]) : itemSeedConfirmed(item);
  }
  return next;
}

function profileStats(
  evidence: CareerEvidence,
  confirmations: ConfirmationMap,
  setVerified: boolean,
) {
  const items = allItems(evidence);
  const total = Math.max(items.length, 1);
  const verifiedCount = setVerified
    ? items.length
    : items.filter((item) => confirmations[item.id]).length;
  const confidence = setVerified
    ? 100
    : Math.round((verifiedCount / total) * 100);
  return { verifiedCount, confidence };
}

function formatDateRange(
  start: string | null,
  end: string | null,
  isCurrent: boolean,
): string {
  const format = (value: string | null) => {
    if (!value) return null;
    const [year, month] = value.split("-");
    if (!year) return value;
    if (!month) return year;
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const monthIndex = Number(month) - 1;
    const label = months[monthIndex] ?? month;
    return `${label} ${year}`;
  };
  const startLabel = format(start);
  const endLabel = isCurrent ? "Present" : format(end);
  if (!startLabel && !endLabel) return "";
  if (!startLabel) return endLabel ?? "";
  if (!endLabel) return startLabel;
  return `${startLabel} — ${endLabel}`;
}
