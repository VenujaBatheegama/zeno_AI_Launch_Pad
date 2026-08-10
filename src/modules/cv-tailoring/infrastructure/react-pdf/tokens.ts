export type ResumeDensity = "comfortable" | "compact";

/**
 * ATS-safe typography tokens.
 * Body letterSpacing must stay 0. Compact mode never drops below ~9.8pt body.
 */
const BASE = {
  colors: {
    text: "#111827",
    muted: "#4B5563",
    rule: "#D1D5DB",
    accent: "#1E3A8A",
    background: "#FFFFFF",
  },
  fonts: {
    // Standard PDF fonts — reliably embedded/substituted and ATS-safe.
    family: "Helvetica",
    bold: "Helvetica-Bold",
  },
  type: {
    letterSpacingBody: 0,
    letterSpacingHeading: 0,
  },
} as const;

export function getResumeTokens(density: ResumeDensity) {
  if (density === "compact") {
    return {
      ...BASE,
      page: {
        size: "A4" as const,
        marginHorizontal: 46,
        marginVertical: 42,
      },
      type: {
        ...BASE.type,
        name: 20,
        targetTitle: 11,
        section: 10.5,
        body: 9.8,
        meta: 9,
        lineHeight: 1.3,
      },
      space: {
        afterHeader: 10,
        sectionGap: 11,
        entryGap: 7,
        bulletGap: 2,
        bulletIndent: 10,
      },
      divider: {
        thickness: 0.5,
      },
    };
  }

  return {
    ...BASE,
    page: {
      size: "A4" as const,
      marginHorizontal: 50,
      marginVertical: 48,
    },
    type: {
      ...BASE.type,
      name: 22,
      targetTitle: 11.5,
      section: 10.5,
      body: 10,
      meta: 9.2,
      lineHeight: 1.33,
    },
    space: {
      afterHeader: 12,
      sectionGap: 12,
      entryGap: 8,
      bulletGap: 3,
      bulletIndent: 11,
    },
    divider: {
      thickness: 0.5,
    },
  };
}

export type ResumeTokens = ReturnType<typeof getResumeTokens>;
