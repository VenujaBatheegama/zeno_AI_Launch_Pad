"use client";

import { useMemo, useState } from "react";

import type { TailoredResume } from "../domain/tailored-resume";

type Category = "All" | "Experience" | "Projects" | "Education" | "Skills";

type LibraryBlock = {
  id: string;
  kind: "header" | "summary" | "skills" | "experience" | "project" | "education";
  title: string;
  subtitle?: string;
  anchor: string;
};

const CATEGORIES: Category[] = [
  "All",
  "Experience",
  "Projects",
  "Education",
  "Skills",
];

type Props = {
  draft: TailoredResume;
  sectionOrder?: string[];
};

/**
 * Left-rail block library matching the Lovable CV editor chrome.
 */
export function CvBlockLibrary({ draft, sectionOrder }: Props) {
  const [category, setCategory] = useState<Category>("All");
  const [query, setQuery] = useState("");

  const blocks = useMemo(
    () => buildLibraryBlocks(draft, sectionOrder),
    [draft, sectionOrder],
  );

  const filtered = blocks.filter((block) => {
    const inCategory =
      category === "All" ||
      (category === "Experience" && block.kind === "experience") ||
      (category === "Projects" && block.kind === "project") ||
      (category === "Education" && block.kind === "education") ||
      (category === "Skills" &&
        (block.kind === "skills" || block.kind === "summary"));
    const needle = query.trim().toLocaleLowerCase();
    const matchesQuery =
      !needle ||
      block.title.toLocaleLowerCase().includes(needle) ||
      (block.subtitle ?? "").toLocaleLowerCase().includes(needle);
    return inCategory && matchesQuery;
  });

  return (
    <aside className="hidden min-h-0 flex-col overflow-hidden border-r border-[var(--zeno-border)] bg-[var(--zeno-surface)] lg:flex">
      <div className="shrink-0 px-3 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--zeno-ink-muted)]">
          Block library
        </p>
        <label className="relative mt-2 block">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--zeno-ink-faint)]">
            <SearchIcon />
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search evidence"
            className="h-9 w-full rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] pl-8 pr-2 text-xs outline-none transition focus:border-[var(--zeno-primary)]/40"
          />
        </label>
        <div className="mt-2 flex flex-wrap gap-1">
          {CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={`rounded-[8px] border px-2 py-0.5 text-[11px] transition ${
                category === item
                  ? "border-[var(--zeno-primary)]/40 bg-[var(--zeno-violet-soft)] text-[var(--zeno-primary)]"
                  : "border-[var(--zeno-border)] text-[var(--zeno-ink-muted)] hover:bg-[var(--zeno-surface-sunken)]"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {filtered.length === 0 ? (
          <li className="px-1 py-4 text-xs text-[var(--zeno-ink-muted)]">
            No blocks match this filter.
          </li>
        ) : (
          filtered.map((block) => (
            <li key={block.id}>
              <button
                type="button"
                onClick={() => scrollToBlock(block.anchor)}
                className="w-full rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-2.5 text-left transition hover:border-[var(--zeno-primary)]/40 hover:bg-[var(--zeno-violet-wash)]"
              >
                <p className="truncate text-xs font-medium text-[var(--zeno-ink)]">
                  {block.title}
                </p>
                {block.subtitle ? (
                  <p className="mt-0.5 truncate text-[11px] text-[var(--zeno-ink-muted)]">
                    {block.subtitle}
                  </p>
                ) : null}
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[10px] text-[var(--zeno-success)]">
                    In CV
                  </span>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--zeno-ink-faint)]">
                    {block.kind}
                  </span>
                </div>
              </button>
            </li>
          ))
        )}
      </ul>
    </aside>
  );
}

function buildLibraryBlocks(
  draft: TailoredResume,
  sectionOrder?: string[],
): LibraryBlock[] {
  const order =
    sectionOrder && sectionOrder.length > 0
      ? sectionOrder
      : [
          "summary",
          "skills",
          "experience",
          "education",
          "projects",
          "certifications",
          "achievements",
          "references",
        ];

  const blocks: LibraryBlock[] = [
    {
      id: "header",
      kind: "header",
      title: draft.contact.fullName || "Header",
      subtitle: draft.targetTitle,
      anchor: "cv-block-header",
    },
  ];

  for (const key of order) {
    if (key === "summary") {
      blocks.push({
        id: "summary",
        kind: "summary",
        title: "Professional summary",
        subtitle: draft.summary.text.slice(0, 80),
        anchor: "cv-block-summary",
      });
    }
    if (key === "skills" && draft.skills.length > 0) {
      blocks.push({
        id: "skills",
        kind: "skills",
        title: "Technical skills",
        subtitle: draft.skills.map((group) => group.category).join(" · "),
        anchor: "cv-block-skills",
      });
    }
    if (key === "experience") {
      for (const role of draft.experience) {
        blocks.push({
          id: `experience-${role.id}`,
          kind: "experience",
          title: role.title,
          subtitle: role.employer,
          anchor: `cv-block-experience-${role.id}`,
        });
      }
    }
    if (key === "education") {
      draft.education.forEach((item, index) => {
        blocks.push({
          id: `education-${item.id ?? index}`,
          kind: "education",
          title: item.qualification || item.institution,
          subtitle: item.institution,
          anchor: `cv-block-education-${item.id ?? index}`,
        });
      });
    }
    if (key === "projects") {
      for (const project of draft.projects) {
        blocks.push({
          id: `project-${project.id}`,
          kind: "project",
          title: project.name,
          subtitle: project.technologies.slice(0, 4).join(", "),
          anchor: `cv-block-project-${project.id}`,
        });
      }
    }
  }

  return blocks;
}

function scrollToBlock(anchor: string) {
  const node = document.getElementById(anchor);
  if (!node) return;
  node.scrollIntoView({ behavior: "smooth", block: "center" });
  node.classList.add("ring-2", "ring-[var(--zeno-primary)]");
  window.setTimeout(() => {
    node.classList.remove("ring-2", "ring-[var(--zeno-primary)]");
  }, 1200);
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
