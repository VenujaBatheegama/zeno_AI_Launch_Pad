"use client";

import { useState } from "react";

import type {
  CareerEvidence,
  CareerEvidenceSet,
} from "../domain/evidence";

type EvidenceFormProps = {
  evidenceSet: CareerEvidenceSet;
  onChanged: (evidenceSet: CareerEvidenceSet) => void;
};

type CollectionKey =
  | "work_experience"
  | "education"
  | "skills"
  | "projects"
  | "certifications";

export function EvidenceForm({
  evidenceSet,
  onChanged,
}: EvidenceFormProps) {
  const [evidence, setEvidence] = useState(evidenceSet.evidence);
  const [acknowledged, setAcknowledged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isVerified = evidenceSet.status === "verified";

  function updateCollection<K extends CollectionKey>(
    key: K,
    index: number,
    update: (item: CareerEvidence[K][number]) => CareerEvidence[K][number],
  ) {
    setEvidence((current) => ({
      ...current,
      [key]: current[key].map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...update(item as CareerEvidence[K][number]),
              origin: "user_edited" as const,
              source_quote: null,
            }
          : item,
      ),
    }));
  }

  function removeItem(key: CollectionKey, index: number) {
    setEvidence((current) => ({
      ...current,
      [key]: current[key].filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function submit(action: "save" | "verify") {
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/evidence/${evidenceSet.id}${action === "verify" ? "/verify" : ""}`,
        {
          method: action === "verify" ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            evidence,
            acknowledged: action === "verify" ? acknowledged : undefined,
          }),
        },
      );
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "The evidence could not be saved.");
      }

      const updated = body as CareerEvidenceSet;
      setEvidence(updated.evidence);
      onChanged(updated);
      setMessage(
        action === "verify"
          ? "Career evidence verified and persisted."
          : "Draft saved.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The evidence could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {isVerified ? "Verified evidence" : "Review required"}
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">
            Career evidence
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Correct, add, or remove anything that is inaccurate. Source quotes
            show where extracted items came from.
          </p>
        </div>
        <span
          className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${
            isVerified
              ? "bg-emerald-100 text-emerald-800"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          {isVerified ? "Verified" : "Draft"}
        </span>
      </div>

      <fieldset disabled={isVerified || isSaving} className="mt-5 space-y-5">
        <EvidenceSection title="Profile">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Full name"
              value={evidence.profile.full_name}
              onChange={(full_name) =>
                setEvidence((current) => ({
                  ...current,
                  profile: { ...current.profile, full_name },
                }))
              }
            />
            <TextField
              label="Email"
              value={evidence.profile.email}
              onChange={(email) =>
                setEvidence((current) => ({
                  ...current,
                  profile: { ...current.profile, email },
                }))
              }
            />
            <TextField
              label="Phone"
              value={evidence.profile.phone}
              onChange={(phone) =>
                setEvidence((current) => ({
                  ...current,
                  profile: { ...current.profile, phone },
                }))
              }
            />
            <TextField
              label="Location"
              value={evidence.profile.location}
              onChange={(location) =>
                setEvidence((current) => ({
                  ...current,
                  profile: { ...current.profile, location },
                }))
              }
            />
          </div>
          <TextArea
            label="Existing CV summary"
            value={evidence.profile.summary}
            onChange={(summary) =>
              setEvidence((current) => ({
                ...current,
                profile: { ...current.profile, summary },
              }))
            }
          />
        </EvidenceSection>

        <EvidenceSection
          title="Work experience"
          onAdd={() =>
            setEvidence((current) => ({
              ...current,
              work_experience: [
                ...current.work_experience,
                {
                  id: crypto.randomUUID(),
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
            }))
          }
        >
          {evidence.work_experience.map((item, index) => (
            <ItemCard
              key={item.id}
              sourceQuote={item.source_quote}
              onRemove={() => removeItem("work_experience", index)}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Employer"
                  value={item.employer}
                  required
                  onChange={(employer) =>
                    updateCollection("work_experience", index, (current) => ({
                      ...current,
                      employer: employer ?? "",
                      origin: "user_edited",
                    }))
                  }
                />
                <TextField
                  label="Role"
                  value={item.role}
                  required
                  onChange={(role) =>
                    updateCollection("work_experience", index, (current) => ({
                      ...current,
                      role: role ?? "",
                      origin: "user_edited",
                    }))
                  }
                />
                <TextField
                  label="Location"
                  value={item.location}
                  onChange={(location) =>
                    updateCollection("work_experience", index, (current) => ({
                      ...current,
                      location,
                      origin: "user_edited",
                    }))
                  }
                />
                <DateFields
                  start={item.start_date}
                  end={item.end_date}
                  onStart={(start_date) =>
                    updateCollection("work_experience", index, (current) => ({
                      ...current,
                      start_date,
                      origin: "user_edited",
                    }))
                  }
                  onEnd={(end_date) =>
                    updateCollection("work_experience", index, (current) => ({
                      ...current,
                      end_date,
                      origin: "user_edited",
                    }))
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={item.is_current}
                  onChange={(event) =>
                    updateCollection("work_experience", index, (current) => ({
                      ...current,
                      is_current: event.target.checked,
                      end_date: event.target.checked ? null : current.end_date,
                      origin: "user_edited",
                    }))
                  }
                />
                Current role
              </label>
              <ListField
                label="Responsibilities and achievements (one per line)"
                values={item.bullets}
                onChange={(bullets) =>
                  updateCollection("work_experience", index, (current) => ({
                    ...current,
                    bullets,
                    origin: "user_edited",
                  }))
                }
              />
            </ItemCard>
          ))}
        </EvidenceSection>

        <EvidenceSection
          title="Education"
          onAdd={() =>
            setEvidence((current) => ({
              ...current,
              education: [
                ...current.education,
                {
                  id: crypto.randomUUID(),
                  origin: "user_edited",
                  source_quote: null,
                  institution: "",
                  qualification: null,
                  field_of_study: null,
                  start_date: null,
                  end_date: null,
                },
              ],
            }))
          }
        >
          {evidence.education.map((item, index) => (
            <ItemCard
              key={item.id}
              sourceQuote={item.source_quote}
              onRemove={() => removeItem("education", index)}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Institution"
                  value={item.institution}
                  required
                  onChange={(institution) =>
                    updateCollection("education", index, (current) => ({
                      ...current,
                      institution: institution ?? "",
                      origin: "user_edited",
                    }))
                  }
                />
                <TextField
                  label="Qualification"
                  value={item.qualification}
                  onChange={(qualification) =>
                    updateCollection("education", index, (current) => ({
                      ...current,
                      qualification,
                      origin: "user_edited",
                    }))
                  }
                />
                <TextField
                  label="Field of study"
                  value={item.field_of_study}
                  onChange={(field_of_study) =>
                    updateCollection("education", index, (current) => ({
                      ...current,
                      field_of_study,
                      origin: "user_edited",
                    }))
                  }
                />
                <DateFields
                  start={item.start_date}
                  end={item.end_date}
                  onStart={(start_date) =>
                    updateCollection("education", index, (current) => ({
                      ...current,
                      start_date,
                      origin: "user_edited",
                    }))
                  }
                  onEnd={(end_date) =>
                    updateCollection("education", index, (current) => ({
                      ...current,
                      end_date,
                      origin: "user_edited",
                    }))
                  }
                />
              </div>
            </ItemCard>
          ))}
        </EvidenceSection>

        <EvidenceSection
          title="Skills"
          onAdd={() =>
            setEvidence((current) => ({
              ...current,
              skills: [
                ...current.skills,
                {
                  id: crypto.randomUUID(),
                  origin: "user_edited",
                  source_quote: null,
                  name: "",
                },
              ],
            }))
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {evidence.skills.map((item, index) => (
              <ItemCard
                key={item.id}
                sourceQuote={item.source_quote}
                onRemove={() => removeItem("skills", index)}
              >
                <TextField
                  label="Skill"
                  value={item.name}
                  required
                  onChange={(name) =>
                    updateCollection("skills", index, (current) => ({
                      ...current,
                      name: name ?? "",
                      origin: "user_edited",
                    }))
                  }
                />
              </ItemCard>
            ))}
          </div>
        </EvidenceSection>

        <EvidenceSection
          title="Projects"
          onAdd={() =>
            setEvidence((current) => ({
              ...current,
              projects: [
                ...current.projects,
                {
                  id: crypto.randomUUID(),
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
            }))
          }
        >
          {evidence.projects.map((item, index) => (
            <ItemCard
              key={item.id}
              sourceQuote={item.source_quote}
              onRemove={() => removeItem("projects", index)}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Project name"
                  value={item.name}
                  required
                  onChange={(name) =>
                    updateCollection("projects", index, (current) => ({
                      ...current,
                      name: name ?? "",
                      origin: "user_edited",
                    }))
                  }
                />
                <TextField
                  label="Role"
                  value={item.role}
                  onChange={(role) =>
                    updateCollection("projects", index, (current) => ({
                      ...current,
                      role,
                      origin: "user_edited",
                    }))
                  }
                />
                <DateFields
                  start={item.start_date}
                  end={item.end_date}
                  onStart={(start_date) =>
                    updateCollection("projects", index, (current) => ({
                      ...current,
                      start_date,
                      origin: "user_edited",
                    }))
                  }
                  onEnd={(end_date) =>
                    updateCollection("projects", index, (current) => ({
                      ...current,
                      end_date,
                      origin: "user_edited",
                    }))
                  }
                />
              </div>
              <ListField
                label="Project evidence (one per line)"
                values={item.bullets}
                onChange={(bullets) =>
                  updateCollection("projects", index, (current) => ({
                    ...current,
                    bullets,
                    origin: "user_edited",
                  }))
                }
              />
              <ListField
                label="Technologies (one per line)"
                values={item.technologies}
                onChange={(technologies) =>
                  updateCollection("projects", index, (current) => ({
                    ...current,
                    technologies,
                    origin: "user_edited",
                  }))
                }
              />
            </ItemCard>
          ))}
        </EvidenceSection>

        <EvidenceSection
          title="Certifications"
          onAdd={() =>
            setEvidence((current) => ({
              ...current,
              certifications: [
                ...current.certifications,
                {
                  id: crypto.randomUUID(),
                  origin: "user_edited",
                  source_quote: null,
                  name: "",
                  issuer: null,
                  issued_date: null,
                },
              ],
            }))
          }
        >
          {evidence.certifications.map((item, index) => (
            <ItemCard
              key={item.id}
              sourceQuote={item.source_quote}
              onRemove={() => removeItem("certifications", index)}
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <TextField
                  label="Certification"
                  value={item.name}
                  required
                  onChange={(name) =>
                    updateCollection("certifications", index, (current) => ({
                      ...current,
                      name: name ?? "",
                      origin: "user_edited",
                    }))
                  }
                />
                <TextField
                  label="Issuer"
                  value={item.issuer}
                  onChange={(issuer) =>
                    updateCollection("certifications", index, (current) => ({
                      ...current,
                      issuer,
                      origin: "user_edited",
                    }))
                  }
                />
                <TextField
                  label="Issued (YYYY or YYYY-MM)"
                  value={item.issued_date}
                  onChange={(issued_date) =>
                    updateCollection("certifications", index, (current) => ({
                      ...current,
                      issued_date,
                      origin: "user_edited",
                    }))
                  }
                />
              </div>
            </ItemCard>
          ))}
        </EvidenceSection>
      </fieldset>

      {evidence.warnings.length > 0 ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">Items to review</p>
          <p className="mt-1 text-xs leading-5 text-amber-900">
            Zeno left these details out rather than guessing. Add them manually
            if the CV supports them.
          </p>
          <div className="mt-2 space-y-2">
            {evidence.warnings.map((warning) => {
              const note = explainExtractionWarning(warning);
              return (
                <div
                  key={warning}
                  className="rounded-lg bg-white/70 px-3 py-2"
                >
                  <p className="font-medium">{note.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-amber-900">
                    {note.explanation}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {!isVerified ? (
        <div className="mt-5 border-t border-slate-200 pt-4">
          <label className="flex items-start gap-3 text-sm leading-6 text-slate-700">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-1"
            />
            I reviewed this information and confirm it is accurate career
            evidence.
          </label>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => submit("save")}
              disabled={isSaving}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
            >
              Save draft
            </button>
            <button
              type="button"
              onClick={() => submit("verify")}
              disabled={isSaving || !acknowledged}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Verify evidence
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p role="status" className="mt-3 text-sm font-medium text-slate-700">
          {message}
        </p>
      ) : null}
    </section>
  );
}

function explainExtractionWarning(warning: string): {
  title: string;
  explanation: string;
} {
  const normalized = warning.trim().replace(/\.+$/, "");
  const incompleteCount = normalized.match(/^(\d+) incomplete item/iu);

  if (incompleteCount) {
    return {
      title: `${incompleteCount[1]} incomplete CV ${incompleteCount[1] === "1" ? "entry was" : "entries were"} skipped`,
      explanation:
        "A required identifier—such as an employer, institution, or item name—was missing. Check the relevant section and add the entry manually if needed.",
    };
  }

  if (normalized.toLowerCase().includes("could not be matched")) {
    const [section, detail] = normalized.split(": ", 2);
    if (detail) {
      return {
        title: section,
        explanation: detail.startsWith("left")
          ? `Zeno ${detail}.`
          : `Zeno left out ${detail.replace(/^omitted /iu, "")}.`,
      };
    }
    return {
      title: "Some extracted wording was not saved",
      explanation:
        "Zeno could not find an exact supporting passage in the CV, so it removed those values to avoid inventing career evidence.",
    };
  }

  const incompleteEntry = normalized.match(
    /^(.*?) was omitted because (.*?)$/iu,
  );
  if (incompleteEntry) {
    return {
      title: incompleteEntry[1],
      explanation: `This entry was left out because ${incompleteEntry[2]}. Add the missing detail manually if it is available.`,
    };
  }

  const partialEntry = normalized.match(
    /^(.*?) was kept for review because (.*?)$/iu,
  );
  if (partialEntry) {
    return {
      title: partialEntry[1],
      explanation: `This entry remains visible, but ${partialEntry[2]}. Complete the blank field before verification.`,
    };
  }

  if (
    normalized.toLowerCase().includes("incomplete or ambiguous") ||
    normalized.toLowerCase().includes("uncertainty or conflicting")
  ) {
    return {
      title: "The CV contains an unclear or incomplete detail",
      explanation:
        "The source text did not identify the detail confidently. Review the related education, experience, project, or certification entry before adding it.",
    };
  }

  return {
    title: normalized,
    explanation:
      "Review the related CV section and correct or add the detail before verification.",
  };
}

function EvidenceSection({
  title,
  onAdd,
  children,
}: {
  title: string;
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Add
          </button>
        ) : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ItemCard({
  sourceQuote,
  onRemove,
  children,
}: {
  sourceQuote: string | null;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="space-y-3">{children}</div>
      {sourceQuote ? (
        <details className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <summary className="cursor-pointer font-medium">
            View supporting CV text
          </summary>
          <p className="mt-2 leading-5">“{sourceQuote}”</p>
        </details>
      ) : (
        <p className="mt-2 text-xs text-slate-500">Added or edited by user.</p>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="mt-3 text-xs font-semibold text-red-700"
      >
        Remove
      </button>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        value={value ?? ""}
        required={required}
        onChange={(event) =>
          onChange(event.target.value === "" && !required ? null : event.target.value)
        }
        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-slate-950"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <textarea
        value={value ?? ""}
        rows={3}
        onChange={(event) => onChange(event.target.value || null)}
        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-slate-950"
      />
    </label>
  );
}

function ListField({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <textarea
        value={values.join("\n")}
        rows={3}
        onChange={(event) =>
          onChange(
            event.target.value
              .split("\n")
              .map((value) => value.trim())
              .filter(Boolean),
          )
        }
        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-slate-950"
      />
    </label>
  );
}

function DateFields({
  start,
  end,
  onStart,
  onEnd,
}: {
  start: string | null;
  end: string | null;
  onStart: (value: string | null) => void;
  onEnd: (value: string | null) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <TextField label="Start (YYYY or YYYY-MM)" value={start} onChange={onStart} />
      <TextField label="End (YYYY or YYYY-MM)" value={end} onChange={onEnd} />
    </div>
  );
}
