"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { defaultResumeSectionOrder } from "../domain/resume-section-order";
import type { TailoredResume } from "../domain/tailored-resume";
import { formatDateRange } from "../infrastructure/react-pdf/dates";
import { getResumeTokens } from "../infrastructure/react-pdf/tokens";

/** A4 — matches React-PDF `size: "A4"`. */
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PAGE_GAP_PX = 32;
const PT_TO_PX = 96 / 72;

type Props = {
  draft: TailoredResume;
  mode: "one_page" | "two_page";
  /** Authoritative order from the stored content plan (same as React-PDF). */
  sectionOrder?: string[];
  status: string;
  onChange: (next: TailoredResume) => void;
};

type Atom = { id: string; node: ReactNode };

/**
 * Editable A4 preview with discrete sheets. Blocks are measured and packed so
 * page breaks never slice through a heading, role, or project mid-line.
 */
export function EditableCvA4Preview({
  draft,
  mode,
  sectionOrder,
  status,
  onChange,
}: Props) {
  const tokens = useMemo(() => getResumeTokens("comfortable"), []);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const emitChange = useCallback((next: TailoredResume) => {
    onChangeRef.current(next);
  }, []);

  const resolvedOrder = useMemo(
    () =>
      sectionOrder && sectionOrder.length > 0
        ? sectionOrder.filter((section) => section !== "contact")
        : defaultResumeSectionOrder(mode),
    [sectionOrder, mode],
  );

  const viewportRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [pageWidthPx, setPageWidthPx] = useState(mmToPx(A4_WIDTH_MM));
  const [pageAtomIds, setPageAtomIds] = useState<string[][]>([[]]);

  const scale = pageWidthPx / mmToPx(A4_WIDTH_MM);
  const pageHeightPx = mmToPx(A4_HEIGHT_MM) * scale;
  const marginXPx = tokens.page.marginHorizontal * PT_TO_PX * scale;
  const marginYPx = tokens.page.marginVertical * PT_TO_PX * scale;
  const contentWidthPx = Math.max(0, pageWidthPx - marginXPx * 2);
  const pageInnerHeightPx = Math.max(0, pageHeightPx - marginYPx * 2);

  const displayAtoms = useMemo(
    () =>
      buildCvAtoms({
        draft,
        sectionOrder: resolvedOrder,
        tokens,
        onChange: emitChange,
        fontScale: scale,
      }),
    [draft, resolvedOrder, tokens, emitChange, scale],
  );

  // Separate element tree so the measure mount does not steal display nodes.
  const measureAtoms = useMemo(
    () =>
      buildCvAtoms({
        draft,
        sectionOrder: resolvedOrder,
        tokens,
        onChange: emitChange,
        fontScale: scale,
      }),
    [draft, resolvedOrder, tokens, emitChange, scale],
  );

  const atomById = useMemo(() => {
    const map = new Map<string, Atom>();
    for (const atom of displayAtoms) map.set(atom.id, atom);
    return map;
  }, [displayAtoms]);

  const pageCount = Math.max(1, pageAtomIds.length);
  const stackHeight =
    pageCount * pageHeightPx + Math.max(0, pageCount - 1) * PAGE_GAP_PX;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => {
      const available = Math.max(280, viewport.clientWidth - 120);
      setPageWidthPx(Math.min(mmToPx(A4_WIDTH_MM), available));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root) return;
    const measured = Array.from(
      root.querySelectorAll<HTMLElement>("[data-cv-atom]"),
    ).map((el) => ({
      id: el.dataset.cvAtom ?? "",
      height: el.getBoundingClientRect().height,
    }));

    const packed = packAtomsIntoPages(
      measured.filter((item) => item.id),
      pageInnerHeightPx,
    );
    // eslint-disable-next-line react-hooks/set-state-in-effect -- paginate from measured atom heights
    setPageAtomIds(packed);
  }, [measureAtoms, pageInnerHeightPx, contentWidthPx, status]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={viewportRef}
        className="cv-dotted-canvas min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
      >
        <div className="mx-auto flex min-h-full w-full max-w-[920px] flex-col items-center px-6 py-10 md:px-10 md:py-14">
          <div
            className="mb-5 flex w-full flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--zeno-ink-muted)]"
            style={{ maxWidth: pageWidthPx }}
          >
            <p>
              A4 preview · {pageCount} page{pageCount === 1 ? "" : "s"}
              {mode === "one_page" && pageCount > 1
                ? " (PDF generation may compact to fit one page)"
                : mode === "two_page" && pageCount === 1
                  ? " (fits on one page)"
                  : ""}
            </p>
            <p>Status: {status.replaceAll("_", " ")}</p>
          </div>

          {/* Off-screen measure: independent atom tree for heights only */}
          <div
            aria-hidden
            className="pointer-events-none absolute -z-10 overflow-hidden opacity-0"
            style={{
              left: -10000,
              top: 0,
              width: contentWidthPx,
            }}
          >
            <div ref={measureRef} style={{ width: contentWidthPx }}>
              {measureAtoms.map((atom) => (
                <div key={`measure-${atom.id}`} data-cv-atom={atom.id}>
                  {atom.node}
                </div>
              ))}
            </div>
          </div>

          <div
            className="relative"
            style={{
              width: pageWidthPx,
              maxWidth: "100%",
              height: stackHeight,
            }}
          >
            {pageAtomIds.map((ids, pageIndex) => (
              <div
                key={`page-${pageIndex}`}
                className="absolute left-0 overflow-hidden bg-white"
                style={{
                  top: pageIndex * (pageHeightPx + PAGE_GAP_PX),
                  width: pageWidthPx,
                  height: pageHeightPx,
                  boxShadow:
                    "0 1px 3px rgba(15, 23, 42, 0.12), 0 10px 28px rgba(15, 23, 42, 0.1)",
                  boxSizing: "border-box",
                }}
              >
                <div
                  className="absolute overflow-x-hidden overflow-y-hidden"
                  style={{
                    top: marginYPx,
                    left: marginXPx,
                    width: contentWidthPx,
                    height: pageInnerHeightPx,
                  }}
                >
                  {ids.map((id) => {
                    const atom = atomById.get(id);
                    if (!atom) return null;
                    return (
                      <div key={`${pageIndex}-${id}`} className="min-w-0 max-w-full">
                        {atom.node}
                      </div>
                    );
                  })}
                </div>
                <p
                  className="pointer-events-none absolute bottom-2.5 right-3.5 m-0 text-[8px]"
                  style={{ color: tokens.colors.muted }}
                >
                  {pageIndex + 1} / {pageCount}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-8 max-w-[420px] text-center text-[11px] leading-relaxed text-[var(--zeno-ink-muted)]">
            This CV is independent of your career profile. Save keeps edits on
            this CV only; Regenerate rebuilds from your profile and discards
            them.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Greedy pack: keep each atom whole; move to next page if it does not fit. */
function packAtomsIntoPages(
  atoms: Array<{ id: string; height: number }>,
  pageInnerHeightPx: number,
): string[][] {
  if (atoms.length === 0) return [[]];
  const limit = Math.max(pageInnerHeightPx, 1);
  const pages: string[][] = [[]];
  let used = 0;

  for (const atom of atoms) {
    const height = Math.max(0, atom.height);
    if (used > 0 && used + height > limit + 0.5) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1]!.push(atom.id);
    used += height;
  }

  return pages;
}

function buildCvAtoms({
  draft,
  sectionOrder,
  tokens,
  onChange,
  fontScale,
}: {
  draft: TailoredResume;
  sectionOrder: string[];
  tokens: ReturnType<typeof getResumeTokens>;
  onChange: (next: TailoredResume) => void;
  fontScale: number;
}): Atom[] {
  const pt = (value: number) => value * PT_TO_PX * fontScale;
  const atoms: Atom[] = [];

  atoms.push({
    id: "header",
    node: (
      <div
        id="cv-block-header"
        style={{ marginBottom: pt(tokens.space.afterHeader) }}
      >
        <input
          value={draft.contact.fullName}
          onChange={(event) =>
            onChange({
              ...draft,
              contact: { ...draft.contact, fullName: event.target.value },
            })
          }
          className="m-0 mb-1 block w-full min-w-0 max-w-full border border-transparent font-bold outline-none focus:border-[var(--zeno-border-hover)]"
          style={{
            ...fieldStyle(tokens, pt),
            fontSize: pt(tokens.type.name),
            lineHeight: 1.15,
            color: tokens.colors.text,
            fontWeight: 700,
          }}
        />
        <input
          value={draft.targetTitle}
          onChange={(event) =>
            onChange({ ...draft, targetTitle: event.target.value })
          }
          className="mb-1.5 block w-full min-w-0 max-w-full border border-transparent outline-none focus:border-[var(--zeno-border-hover)]"
          style={{
            ...fieldStyle(tokens, pt),
            fontWeight: 700,
            fontSize: pt(tokens.type.targetTitle),
            color: tokens.colors.accent,
            lineHeight: 1.2,
          }}
        />
        <div
          className="flex w-full min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5"
          style={{ fontSize: pt(tokens.type.meta), color: tokens.colors.muted }}
        >
          {(
            [
              ["email", draft.contact.email ?? "", "Email"],
              ["phone", draft.contact.phone ?? "", "Phone"],
              ["location", draft.contact.location ?? "", "Location"],
            ] as const
          ).map(([key, value, placeholder], index) => (
            <span key={key} className="inline-flex min-w-0 items-center">
              {index > 0 ? <span className="px-0.5">|</span> : null}
              <input
                value={value}
                placeholder={placeholder}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    contact: {
                      ...draft.contact,
                      [key]: event.target.value.trim() || null,
                    },
                  })
                }
                className="min-w-0 max-w-[11rem] border border-transparent bg-transparent outline-none focus:border-[var(--zeno-border-hover)]"
                style={{
                  ...fieldStyle(tokens, pt),
                  fontSize: pt(tokens.type.meta),
                  color: tokens.colors.muted,
                  width: Math.max(72, value.length * 7 + 24),
                }}
              />
            </span>
          ))}
        </div>
      </div>
    ),
  });

  for (const key of sectionOrder) {
    if (key === "summary") {
      atoms.push({
        id: "summary",
        node: (
          <div id="cv-block-summary">
            <PreviewSection title="Professional Summary" tokens={tokens} pt={pt}>
              <AutoTextarea
                value={draft.summary.text}
                onChange={(text) =>
                  onChange({
                    ...draft,
                    summary: { ...draft.summary, text },
                  })
                }
                tokens={tokens}
                pt={pt}
                minRows={2}
              />
            </PreviewSection>
          </div>
        ),
      });
      continue;
    }

    if (key === "skills" && draft.skills.length > 0) {
      atoms.push({
        id: "skills",
        node: (
          <div id="cv-block-skills">
            <PreviewSection title="Technical Skills" tokens={tokens} pt={pt}>
              {draft.skills.map((group, groupIndex) => (
                <div
                  key={`${group.category}-${groupIndex}`}
                  className="mb-0.5 flex w-full min-w-0 max-w-full items-baseline gap-1.5 overflow-hidden"
                >
                  <span
                    className="shrink-0 font-bold"
                    style={{ fontSize: pt(tokens.type.body) }}
                  >
                    {group.category}:
                  </span>
                  <input
                    value={group.items.join(", ")}
                    onChange={(event) => {
                      const items = event.target.value
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean)
                        .map((item) => item.slice(0, 60));
                      const skills = draft.skills.map((entry, index) =>
                        index === groupIndex
                          ? {
                              ...entry,
                              items: items.length > 0 ? items : entry.items,
                            }
                          : entry,
                      );
                      onChange({ ...draft, skills });
                    }}
                    className="min-w-0 border border-transparent bg-transparent outline-none focus:border-[var(--zeno-border-hover)]"
                    style={{
                      ...fieldStyle(tokens, pt),
                      width: 0,
                      flex: "1 1 0%",
                    }}
                  />
                </div>
              ))}
            </PreviewSection>
          </div>
        ),
      });
      continue;
    }

    if (key === "experience" && draft.experience.length > 0) {
      draft.experience.forEach((role, roleIndex) => {
        atoms.push({
          id: `experience-${role.id}`,
          node: (
            <div
              id={
                roleIndex === 0
                  ? "cv-block-experience"
                  : `cv-block-experience-${role.id}`
              }
            >
              {roleIndex === 0 ? (
                <SectionHeading title="Experience" tokens={tokens} pt={pt} />
              ) : null}
              <div style={{ marginBottom: pt(tokens.space.entryGap) }}>
                <div style={entryHeaderRow}>
                  <input
                    value={role.title}
                    onChange={(event) => {
                      const experience = draft.experience.map((entry, index) =>
                        index === roleIndex
                          ? { ...entry, title: event.target.value }
                          : entry,
                      );
                      onChange({ ...draft, experience });
                    }}
                    className="min-w-0 flex-1 border border-transparent bg-transparent outline-none focus:border-[var(--zeno-border-hover)]"
                    style={{
                      ...fieldStyle(tokens, pt),
                      ...entryTitle(tokens, pt),
                      margin: 0,
                      fontWeight: 700,
                    }}
                  />
                  <div className="flex shrink-0 items-center gap-1">
                    <input
                      value={role.startDate}
                      placeholder="Start"
                      onChange={(event) => {
                        const experience = draft.experience.map(
                          (entry, index) =>
                            index === roleIndex
                              ? { ...entry, startDate: event.target.value }
                              : entry,
                        );
                        onChange({ ...draft, experience });
                      }}
                      className="w-[4.5rem] border border-transparent bg-transparent text-right outline-none focus:border-[var(--zeno-border-hover)]"
                      style={{
                        ...fieldStyle(tokens, pt),
                        ...entryMeta(tokens, pt),
                        margin: 0,
                      }}
                    />
                    <span style={entryMeta(tokens, pt)}>–</span>
                    <input
                      value={role.isCurrent ? "Present" : (role.endDate ?? "")}
                      placeholder="End"
                      onChange={(event) => {
                        const raw = event.target.value;
                        const isCurrent = /^present$/i.test(raw.trim());
                        const experience = draft.experience.map(
                          (entry, index) =>
                            index === roleIndex
                              ? {
                                  ...entry,
                                  isCurrent,
                                  endDate: isCurrent ? null : raw || null,
                                }
                              : entry,
                        );
                        onChange({ ...draft, experience });
                      }}
                      className="w-[4.5rem] border border-transparent bg-transparent text-right outline-none focus:border-[var(--zeno-border-hover)]"
                      style={{
                        ...fieldStyle(tokens, pt),
                        ...entryMeta(tokens, pt),
                        margin: 0,
                      }}
                    />
                  </div>
                </div>
                <input
                  value={[role.employer, role.location]
                    .filter(Boolean)
                    .join(" · ")}
                  onChange={(event) => {
                    const [employer = "", ...rest] = event.target.value
                      .split("·")
                      .map((part) => part.trim());
                    const location = rest.join(" · ") || undefined;
                    const experience = draft.experience.map((entry, index) =>
                      index === roleIndex
                        ? { ...entry, employer, location }
                        : entry,
                    );
                    onChange({ ...draft, experience });
                  }}
                  className="mb-0.5 w-full border border-transparent bg-transparent outline-none focus:border-[var(--zeno-border-hover)]"
                  style={{
                    ...fieldStyle(tokens, pt),
                    ...entrySub(tokens, pt),
                    margin: "1px 0 2px",
                  }}
                  placeholder="Employer · Location"
                />
                {role.bullets.map((bullet, bulletIndex) => (
                  <div
                    key={`${role.id}-${bulletIndex}`}
                    className="flex w-full min-w-0 max-w-full gap-1 overflow-hidden pl-0.5"
                    style={{ marginBottom: pt(tokens.space.bulletGap) }}
                  >
                    <span
                      className="shrink-0"
                      style={{ width: pt(tokens.space.bulletIndent) }}
                    >
                      •
                    </span>
                    <AutoTextarea
                      value={bullet.text}
                      onChange={(text) => {
                        const experience = draft.experience.map(
                          (entry, index) => {
                            if (index !== roleIndex) return entry;
                            const bullets = entry.bullets.map(
                              (item, itemIndex) =>
                                itemIndex === bulletIndex
                                  ? { ...item, text }
                                  : item,
                            );
                            return { ...entry, bullets };
                          },
                        );
                        onChange({ ...draft, experience });
                      }}
                      tokens={tokens}
                      pt={pt}
                      minRows={1}
                      fillRow
                    />
                    <button
                      type="button"
                      style={editorChromeButton}
                      onClick={() => {
                        const experience = draft.experience.map(
                          (entry, index) => {
                            if (index !== roleIndex) return entry;
                            const bullets = entry.bullets.filter(
                              (_, itemIndex) => itemIndex !== bulletIndex,
                            );
                            return {
                              ...entry,
                              bullets:
                                bullets.length > 0 ? bullets : entry.bullets,
                            };
                          },
                        );
                        onChange({ ...draft, experience });
                      }}
                    >
                      Del
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  style={{
                    ...editorChromeButton,
                    color: tokens.colors.accent,
                  }}
                  onClick={() => {
                    const experience = draft.experience.map((entry, index) => {
                      if (index !== roleIndex) return entry;
                      if (entry.bullets.length >= 6) return entry;
                      return {
                        ...entry,
                        bullets: [
                          ...entry.bullets,
                          {
                            text: "Describe an accomplishment in this role.",
                            factIds: ["user_authored"],
                            source: "user_edited" as const,
                          },
                        ],
                      };
                    });
                    onChange({ ...draft, experience });
                  }}
                >
                  Add bullet
                </button>
              </div>
            </div>
          ),
        });
      });
      continue;
    }

    if (key === "education" && draft.education.length > 0) {
      draft.education.forEach((item, educationIndex) => {
        atoms.push({
          id: `education-${item.id ?? educationIndex}`,
          node: (
            <div
              id={
                educationIndex === 0
                  ? "cv-block-education"
                  : `cv-block-education-${item.id ?? educationIndex}`
              }
            >
              {educationIndex === 0 ? (
                <SectionHeading title="Education" tokens={tokens} pt={pt} />
              ) : null}
              <div style={{ marginBottom: pt(tokens.space.entryGap) }}>
                <div style={entryHeaderRow}>
                  <input
                    value={item.qualification || item.institution}
                    onChange={(event) => {
                      const education = draft.education.map((entry, index) =>
                        index === educationIndex
                          ? {
                              ...entry,
                              qualification: event.target.value,
                            }
                          : entry,
                      );
                      onChange({ ...draft, education });
                    }}
                    className="min-w-0 flex-1 border border-transparent bg-transparent outline-none focus:border-[var(--zeno-border-hover)]"
                    style={{
                      ...fieldStyle(tokens, pt),
                      ...entryTitle(tokens, pt),
                      margin: 0,
                      fontWeight: 700,
                    }}
                  />
                  <div className="flex shrink-0 items-center gap-1">
                    <input
                      value={item.startDate ?? ""}
                      placeholder="Start"
                      onChange={(event) => {
                        const education = draft.education.map((entry, index) =>
                          index === educationIndex
                            ? { ...entry, startDate: event.target.value }
                            : entry,
                        );
                        onChange({ ...draft, education });
                      }}
                      className="w-[4.5rem] border border-transparent bg-transparent text-right outline-none focus:border-[var(--zeno-border-hover)]"
                      style={{
                        ...fieldStyle(tokens, pt),
                        ...entryMeta(tokens, pt),
                        margin: 0,
                      }}
                    />
                    <span style={entryMeta(tokens, pt)}>–</span>
                    <input
                      value={item.endDate ?? ""}
                      placeholder="End"
                      onChange={(event) => {
                        const education = draft.education.map((entry, index) =>
                          index === educationIndex
                            ? { ...entry, endDate: event.target.value }
                            : entry,
                        );
                        onChange({ ...draft, education });
                      }}
                      className="w-[4.5rem] border border-transparent bg-transparent text-right outline-none focus:border-[var(--zeno-border-hover)]"
                      style={{
                        ...fieldStyle(tokens, pt),
                        ...entryMeta(tokens, pt),
                        margin: 0,
                      }}
                    />
                  </div>
                </div>
                <input
                  value={item.institution}
                  onChange={(event) => {
                    const education = draft.education.map((entry, index) =>
                      index === educationIndex
                        ? { ...entry, institution: event.target.value }
                        : entry,
                    );
                    onChange({ ...draft, education });
                  }}
                  className="mb-0.5 w-full border border-transparent bg-transparent outline-none focus:border-[var(--zeno-border-hover)]"
                  style={{
                    ...fieldStyle(tokens, pt),
                    ...entrySub(tokens, pt),
                    margin: "1px 0 2px",
                  }}
                  placeholder="Institution"
                />
                <AutoTextarea
                  value={(item.details ?? []).join("\n")}
                  onChange={(text) => {
                    const details = text
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean);
                    const education = draft.education.map((entry, index) =>
                      index === educationIndex ? { ...entry, details } : entry,
                    );
                    onChange({ ...draft, education });
                  }}
                  tokens={tokens}
                  pt={pt}
                  minRows={1}
                  placeholder="Optional details (one per line)"
                />
              </div>
            </div>
          ),
        });
      });
      continue;
    }

    if (key === "projects" && draft.projects.length > 0) {
      draft.projects.forEach((project, projectIndex) => {
        atoms.push({
          id: `project-${project.id}`,
          node: (
            <div
              id={
                projectIndex === 0
                  ? "cv-block-projects"
                  : `cv-block-project-${project.id}`
              }
            >
              {projectIndex === 0 ? (
                <SectionHeading
                  title="Selected Projects"
                  tokens={tokens}
                  pt={pt}
                />
              ) : null}
              <div style={{ marginBottom: pt(tokens.space.entryGap) }}>
                <div style={entryHeaderRow}>
                  <input
                    value={project.name}
                    onChange={(event) => {
                      const projects = draft.projects.map((entry, index) =>
                        index === projectIndex
                          ? { ...entry, name: event.target.value }
                          : entry,
                      );
                      onChange({ ...draft, projects });
                    }}
                    className="min-w-0 flex-1 border border-transparent bg-transparent outline-none focus:border-[var(--zeno-border-hover)]"
                    style={{
                      ...fieldStyle(tokens, pt),
                      ...entryTitle(tokens, pt),
                      margin: 0,
                      fontWeight: 700,
                    }}
                  />
                  <input
                    value={
                      project.url
                        ? project.url.replace(/^https?:\/\//u, "")
                        : formatDateRange(project.startDate, project.endDate)
                    }
                    onChange={(event) => {
                      const value = event.target.value.trim();
                      const projects = draft.projects.map((entry, index) => {
                        if (index !== projectIndex) return entry;
                        if (!value) {
                          return {
                            ...entry,
                            url: undefined,
                            startDate: undefined,
                            endDate: undefined,
                          };
                        }
                        if (/[./]/.test(value) || /^https?:/i.test(value)) {
                          return {
                            ...entry,
                            url: value.startsWith("http")
                              ? value
                              : `https://${value}`,
                          };
                        }
                        return { ...entry, startDate: value, url: undefined };
                      });
                      onChange({ ...draft, projects });
                    }}
                    className="w-[7rem] shrink-0 border border-transparent bg-transparent text-right outline-none focus:border-[var(--zeno-border-hover)]"
                    style={{
                      ...fieldStyle(tokens, pt),
                      ...entryMeta(tokens, pt),
                      margin: 0,
                    }}
                    placeholder="URL or dates"
                  />
                </div>
                <input
                  value={project.technologies.join(", ")}
                  onChange={(event) => {
                    const technologies = event.target.value
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean);
                    const projects = draft.projects.map((entry, index) =>
                      index === projectIndex
                        ? { ...entry, technologies }
                        : entry,
                    );
                    onChange({ ...draft, projects });
                  }}
                  className="mb-0.5 w-full border border-transparent bg-transparent outline-none focus:border-[var(--zeno-border-hover)]"
                  style={{
                    ...fieldStyle(tokens, pt),
                    ...entrySub(tokens, pt),
                    margin: "0 0 3px",
                  }}
                  placeholder="Technologies (comma-separated)"
                />
                {project.paragraphs.map((paragraph, paragraphIndex) => (
                  <AutoTextarea
                    key={`${project.id}-${paragraphIndex}`}
                    value={paragraph.text}
                    onChange={(text) => {
                      const projects = draft.projects.map((entry, index) => {
                        if (index !== projectIndex) return entry;
                        const paragraphs = entry.paragraphs.map(
                          (item, itemIndex) =>
                            itemIndex === paragraphIndex
                              ? { ...item, text }
                              : item,
                        );
                        return { ...entry, paragraphs };
                      });
                      onChange({ ...draft, projects });
                    }}
                    tokens={tokens}
                    pt={pt}
                    minRows={3}
                    style={{ marginBottom: 4 }}
                  />
                ))}
              </div>
            </div>
          ),
        });
      });
      continue;
    }

    if (key === "certifications" && draft.certifications.length > 0) {
      atoms.push({
        id: "certifications",
        node: (
          <PreviewSection title="Certifications" tokens={tokens} pt={pt}>
            {draft.certifications.map((item, certIndex) => (
              <div
                key={item.id ?? `${item.name}-${certIndex}`}
                className="mb-1 flex min-w-0 flex-wrap items-baseline gap-1"
              >
                <input
                  value={item.name}
                  onChange={(event) => {
                    const certifications = draft.certifications.map(
                      (entry, index) =>
                        index === certIndex
                          ? { ...entry, name: event.target.value }
                          : entry,
                    );
                    onChange({ ...draft, certifications });
                  }}
                  className="min-w-0 flex-1 border border-transparent bg-transparent outline-none focus:border-[var(--zeno-border-hover)]"
                  style={{
                    ...fieldStyle(tokens, pt),
                    ...bodyText(tokens, pt),
                  }}
                  placeholder="Certification"
                />
                <input
                  value={item.issuer ?? ""}
                  onChange={(event) => {
                    const certifications = draft.certifications.map(
                      (entry, index) =>
                        index === certIndex
                          ? {
                              ...entry,
                              issuer: event.target.value || undefined,
                            }
                          : entry,
                    );
                    onChange({ ...draft, certifications });
                  }}
                  className="w-[8rem] border border-transparent bg-transparent outline-none focus:border-[var(--zeno-border-hover)]"
                  style={{
                    ...fieldStyle(tokens, pt),
                    ...bodyText(tokens, pt),
                  }}
                  placeholder="Issuer"
                />
                <input
                  value={item.date ?? ""}
                  onChange={(event) => {
                    const certifications = draft.certifications.map(
                      (entry, index) =>
                        index === certIndex
                          ? {
                              ...entry,
                              date: event.target.value || undefined,
                            }
                          : entry,
                    );
                    onChange({ ...draft, certifications });
                  }}
                  className="w-[4.5rem] border border-transparent bg-transparent outline-none focus:border-[var(--zeno-border-hover)]"
                  style={{
                    ...fieldStyle(tokens, pt),
                    ...bodyText(tokens, pt),
                  }}
                  placeholder="Date"
                />
              </div>
            ))}
          </PreviewSection>
        ),
      });
      continue;
    }

    if (key === "achievements" && draft.achievements.length > 0) {
      atoms.push({
        id: "achievements",
        node: (
          <PreviewSection title="Achievements" tokens={tokens} pt={pt}>
            {draft.achievements.map((item, achievementIndex) => (
              <div
                key={`achievement-${achievementIndex}`}
                className="flex min-w-0 gap-1"
                style={{ marginBottom: pt(tokens.space.bulletGap) }}
              >
                <span
                  className="shrink-0"
                  style={{ width: pt(tokens.space.bulletIndent) }}
                >
                  •
                </span>
                <AutoTextarea
                  value={item.text}
                  onChange={(text) => {
                    const achievements = draft.achievements.map(
                      (entry, index) =>
                        index === achievementIndex
                          ? { ...entry, text }
                          : entry,
                    );
                    onChange({ ...draft, achievements });
                  }}
                  tokens={tokens}
                  pt={pt}
                  minRows={1}
                  fillRow
                />
              </div>
            ))}
          </PreviewSection>
        ),
      });
      continue;
    }

    if (key === "references" && draft.references.length > 0) {
      atoms.push({
        id: "references",
        node: (
          <div style={{ marginTop: 2 }}>
            <SectionHeading title="References" tokens={tokens} pt={pt} />
            <div className="flex flex-wrap gap-x-[4%]">
              {draft.references.map((referee, refereeIndex) => (
                <div key={referee.id} className="mb-1 w-[48%] min-w-0 space-y-0.5">
                  <input
                    value={referee.name}
                    onChange={(event) => {
                      const references = draft.references.map((entry, index) =>
                        index === refereeIndex
                          ? { ...entry, name: event.target.value }
                          : entry,
                      );
                      onChange({ ...draft, references });
                    }}
                    className="m-0 mb-px w-full border border-transparent bg-transparent font-bold outline-none focus:border-[var(--zeno-border-hover)]"
                    style={{
                      ...fieldStyle(tokens, pt),
                      fontSize: pt(tokens.type.meta),
                      fontWeight: 700,
                    }}
                    placeholder="Name"
                  />
                  <input
                    value={[referee.title, referee.organization]
                      .filter(Boolean)
                      .join(" · ")}
                    onChange={(event) => {
                      const [title = "", ...rest] = event.target.value
                        .split("·")
                        .map((part) => part.trim());
                      const organization = rest.join(" · ") || undefined;
                      const references = draft.references.map((entry, index) =>
                        index === refereeIndex
                          ? {
                              ...entry,
                              title: title || undefined,
                              organization,
                            }
                          : entry,
                      );
                      onChange({ ...draft, references });
                    }}
                    className="w-full border border-transparent bg-transparent outline-none focus:border-[var(--zeno-border-hover)]"
                    style={{
                      ...fieldStyle(tokens, pt),
                      ...entryMeta(tokens, pt),
                      margin: 0,
                    }}
                    placeholder="Title · Organization"
                  />
                  <input
                    value={[referee.email, referee.phone]
                      .filter(Boolean)
                      .join(" · ")}
                    onChange={(event) => {
                      const [email = "", ...rest] = event.target.value
                        .split("·")
                        .map((part) => part.trim());
                      const phone = rest.join(" · ") || null;
                      const references = draft.references.map((entry, index) =>
                        index === refereeIndex
                          ? {
                              ...entry,
                              email: email || null,
                              phone,
                            }
                          : entry,
                      );
                      onChange({ ...draft, references });
                    }}
                    className="w-full border border-transparent bg-transparent outline-none focus:border-[var(--zeno-border-hover)]"
                    style={{
                      ...fieldStyle(tokens, pt),
                      ...entryMeta(tokens, pt),
                      margin: 0,
                    }}
                    placeholder="Email · Phone"
                  />
                </div>
              ))}
            </div>
          </div>
        ),
      });
    }
  }

  return atoms;
}

function PreviewSection({
  title,
  tokens,
  pt,
  children,
}: {
  title: string;
  tokens: ReturnType<typeof getResumeTokens>;
  pt: (value: number) => number;
  children: ReactNode;
}) {
  return (
    <section
      className="w-full min-w-0 max-w-full"
      style={{ marginBottom: pt(tokens.space.sectionGap) }}
    >
      <SectionHeading title={title} tokens={tokens} pt={pt} />
      {children}
    </section>
  );
}

function SectionHeading({
  title,
  tokens,
  pt,
}: {
  title: string;
  tokens: ReturnType<typeof getResumeTokens>;
  pt: (value: number) => number;
}) {
  return (
    <>
      <p style={sectionHeading(tokens, pt)}>{title}</p>
      <div style={rule(tokens)} />
    </>
  );
}

function AutoTextarea({
  value,
  onChange,
  tokens,
  pt,
  minRows = 1,
  placeholder,
  style,
  fillRow = false,
}: {
  value: string;
  onChange: (value: string) => void;
  tokens: ReturnType<typeof getResumeTokens>;
  pt: (value: number) => number;
  minRows?: number;
  placeholder?: string;
  style?: CSSProperties;
  fillRow?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="min-w-0 max-w-full rounded-[2px] border border-transparent bg-transparent outline-none focus:border-[var(--zeno-border-hover)]"
      style={{
        padding: "1px 2px",
        margin: 0,
        fontFamily: "Helvetica, Arial, sans-serif",
        fontSize: pt(tokens.type.body),
        lineHeight: tokens.type.lineHeight,
        color: tokens.colors.text,
        boxSizing: "border-box",
        resize: "none",
        overflow: "hidden",
        display: "block",
        ...(fillRow
          ? { width: 0, flex: "1 1 0%" }
          : { width: "100%", maxWidth: "100%" }),
        ...style,
      }}
    />
  );
}

function fieldStyle(
  tokens: ReturnType<typeof getResumeTokens>,
  pt: (value: number) => number,
): CSSProperties {
  return {
    border: "1px solid transparent",
    borderRadius: 2,
    background: "transparent",
    padding: "1px 2px",
    margin: 0,
    fontFamily: "Helvetica, Arial, sans-serif",
    fontSize: pt(tokens.type.body),
    lineHeight: tokens.type.lineHeight,
    color: tokens.colors.text,
    outline: "none",
    boxSizing: "border-box",
    maxWidth: "100%",
  };
}

function bodyText(
  tokens: ReturnType<typeof getResumeTokens>,
  pt: (value: number) => number,
): CSSProperties {
  return {
    margin: 0,
    fontSize: pt(tokens.type.body),
    lineHeight: tokens.type.lineHeight,
    color: tokens.colors.text,
  };
}

function sectionHeading(
  tokens: ReturnType<typeof getResumeTokens>,
  pt: (value: number) => number,
): CSSProperties {
  return {
    margin: "0 0 3px",
    fontWeight: 700,
    fontSize: pt(tokens.type.section),
    textTransform: "uppercase",
    letterSpacing: 0,
    color: tokens.colors.text,
  };
}

function rule(tokens: ReturnType<typeof getResumeTokens>): CSSProperties {
  return {
    borderBottom: `${tokens.divider.thickness}pt solid ${tokens.colors.rule}`,
    marginBottom: 6,
  };
}

function entryTitle(
  tokens: ReturnType<typeof getResumeTokens>,
  pt: (value: number) => number,
): CSSProperties {
  return {
    fontWeight: 700,
    fontSize: pt(tokens.type.body),
    color: tokens.colors.text,
    flex: 1,
    minWidth: 0,
  };
}

function entryMeta(
  tokens: ReturnType<typeof getResumeTokens>,
  pt: (value: number) => number,
): CSSProperties {
  return {
    fontSize: pt(tokens.type.meta),
    color: tokens.colors.muted,
    flexShrink: 0,
  };
}

function entrySub(
  tokens: ReturnType<typeof getResumeTokens>,
  pt: (value: number) => number,
): CSSProperties {
  return {
    fontSize: pt(tokens.type.meta),
    color: tokens.colors.muted,
  };
}

const entryHeaderRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 8,
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
};

const editorChromeButton: CSSProperties = {
  flexShrink: 0,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontSize: 9,
  padding: "0 2px",
  color: "#b91c1c",
};

function mmToPx(mm: number): number {
  return (mm / 25.4) * 96;
}
