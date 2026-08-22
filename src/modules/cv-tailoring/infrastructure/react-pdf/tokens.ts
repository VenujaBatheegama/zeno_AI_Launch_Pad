export type ResumeDensity = "comfortable" | "compact" | "tight";

/**
 * ATS-safe typography tokens.
 * Body letterSpacing must stay 0.
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
  if (density === "tight") {
    return {
      ...BASE,
      page: {
        size: "A4" as const,
        marginHorizontal: 38,
        marginVertical: 32,
      },
      type: {
        ...BASE.type,
        name: 18,
        targetTitle: 10.5,
        section: 10,
        body: 9.2,
        meta: 8.5,
        lineHeight: 1.22,
      },
      space: {
        afterHeader: 8,
        sectionGap: 8,
        entryGap: 5,
        bulletGap: 1.5,
        bulletIndent: 9,
      },
      divider: {
        thickness: 0.5,
      },
    };
  }

  if (density === "compact") {
    return {
      ...BASE,
      page: {
        size: "A4" as const,
        marginHorizontal: 44,
        marginVertical: 38,
      },
      type: {
        ...BASE.type,
        name: 20,
        targetTitle: 11,
        section: 10.5,
        body: 9.6,
        meta: 8.8,
        lineHeight: 1.26,
      },
      space: {
        afterHeader: 10,
        sectionGap: 10,
        entryGap: 6,
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
