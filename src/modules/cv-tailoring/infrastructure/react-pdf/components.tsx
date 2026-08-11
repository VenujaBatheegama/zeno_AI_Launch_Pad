import { Text, View, StyleSheet, Link } from "@react-pdf/renderer";
import type { ReactNode } from "react";

import type { ResumeTokens } from "./tokens";

export function createResumeStyles(tokens: ResumeTokens) {
  return StyleSheet.create({
    page: {
      backgroundColor: tokens.colors.background,
      color: tokens.colors.text,
      fontFamily: tokens.fonts.family,
      fontSize: tokens.type.body,
      lineHeight: tokens.type.lineHeight,
      letterSpacing: tokens.type.letterSpacingBody,
      paddingTop: tokens.page.marginVertical,
      paddingBottom: tokens.page.marginVertical,
      paddingHorizontal: tokens.page.marginHorizontal,
    },
    name: {
      fontFamily: tokens.fonts.bold,
      fontSize: tokens.type.name,
      color: tokens.colors.text,
      marginBottom: 4,
      lineHeight: 1.15,
      letterSpacing: tokens.type.letterSpacingBody,
    },
    targetTitle: {
      fontFamily: tokens.fonts.bold,
      fontSize: tokens.type.targetTitle,
      color: tokens.colors.accent,
      marginBottom: 5,
      lineHeight: 1.2,
      letterSpacing: tokens.type.letterSpacingBody,
    },
    contact: {
      fontSize: tokens.type.meta,
      color: tokens.colors.muted,
      marginBottom: 0,
      lineHeight: 1.35,
      letterSpacing: tokens.type.letterSpacingBody,
    },
    section: {
      marginBottom: tokens.space.sectionGap,
    },
    sectionHeading: {
      fontFamily: tokens.fonts.bold,
      fontSize: tokens.type.section,
      color: tokens.colors.text,
      textTransform: "uppercase",
      marginBottom: 3,
      letterSpacing: tokens.type.letterSpacingHeading,
    },
    rule: {
      borderBottomWidth: tokens.divider.thickness,
      borderBottomColor: tokens.colors.rule,
      marginBottom: 6,
    },
    body: {
      fontSize: tokens.type.body,
      color: tokens.colors.text,
      lineHeight: tokens.type.lineHeight,
      letterSpacing: tokens.type.letterSpacingBody,
      textAlign: "left",
    },
    projectParagraph: {
      fontSize: tokens.type.body,
      color: tokens.colors.text,
      lineHeight: tokens.type.lineHeight,
      letterSpacing: tokens.type.letterSpacingBody,
      marginBottom: 4,
      textAlign: "left",
    },
    entry: {
      marginBottom: tokens.space.entryGap,
    },
    entryHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 8,
    },
    entryTitle: {
      fontFamily: tokens.fonts.bold,
      fontSize: tokens.type.body,
      color: tokens.colors.text,
      flexGrow: 1,
      flexShrink: 1,
      letterSpacing: tokens.type.letterSpacingBody,
    },
    entryMeta: {
      fontSize: tokens.type.meta,
      color: tokens.colors.muted,
      flexShrink: 0,
      letterSpacing: tokens.type.letterSpacingBody,
    },
    entrySub: {
      fontSize: tokens.type.meta,
      color: tokens.colors.muted,
      marginTop: 1,
      marginBottom: 2,
      letterSpacing: tokens.type.letterSpacingBody,
    },
    techLine: {
      fontSize: tokens.type.meta,
      color: tokens.colors.muted,
      marginBottom: 3,
      letterSpacing: tokens.type.letterSpacingBody,
    },
    skillRow: {
      fontSize: tokens.type.body,
      marginBottom: 2,
      lineHeight: tokens.type.lineHeight,
      letterSpacing: tokens.type.letterSpacingBody,
      textAlign: "left",
    },
    skillCategory: {
      fontFamily: tokens.fonts.bold,
    },
    bulletRow: {
      flexDirection: "row",
      marginBottom: tokens.space.bulletGap,
      paddingLeft: 2,
    },
    bulletGlyph: {
      width: tokens.space.bulletIndent,
      fontSize: tokens.type.body,
      letterSpacing: tokens.type.letterSpacingBody,
    },
    bulletText: {
      flex: 1,
      fontSize: tokens.type.body,
      lineHeight: tokens.type.lineHeight,
      letterSpacing: tokens.type.letterSpacingBody,
      textAlign: "left",
    },
    link: {
      color: tokens.colors.accent,
      textDecoration: "none",
    },
    referenceSection: {
      marginTop: 2,
      marginBottom: 0,
    },
    referenceRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "flex-start",
    },
    referenceColumn: {
      width: "48%",
      marginBottom: 0,
    },
    referenceColumnLeft: {
      marginRight: "4%",
    },
    referenceName: {
      fontFamily: tokens.fonts.bold,
      fontSize: tokens.type.meta,
      color: tokens.colors.text,
      letterSpacing: tokens.type.letterSpacingBody,
      marginBottom: 1,
    },
    referenceMeta: {
      fontSize: tokens.type.meta,
      color: tokens.colors.muted,
      lineHeight: 1.2,
      letterSpacing: tokens.type.letterSpacingBody,
    },
  });
}

export type ResumeStyles = ReturnType<typeof createResumeStyles>;

export function Section(props: {
  title: string;
  styles: ResumeStyles;
  children: ReactNode;
  minPresenceAhead?: number;
}) {
  return (
    <View
      style={props.styles.section}
      wrap
      minPresenceAhead={props.minPresenceAhead ?? 56}
    >
      <Text style={props.styles.sectionHeading} minPresenceAhead={40} wrap={false}>
        {props.title}
      </Text>
      <View style={props.styles.rule} />
      {props.children}
    </View>
  );
}

export function BulletList(props: {
  items: string[];
  styles: ResumeStyles;
}) {
  return (
    <View>
      {props.items.map((item, index) => (
        <View
          key={`${index}-${item.slice(0, 24)}`}
          style={props.styles.bulletRow}
          wrap={false}
        >
          <Text style={props.styles.bulletGlyph}>•</Text>
          <Text style={props.styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export function ContactLine(props: {
  parts: Array<{ label?: string; value: string; href?: string }>;
  styles: ResumeStyles;
}) {
  const nodes: ReactNode[] = [];
  props.parts.forEach((part, index) => {
    if (index > 0) {
      nodes.push(<Text key={`sep-${index}`}>{" | "}</Text>);
    }
    if (part.href) {
      nodes.push(
        <Link key={`${part.value}-${index}`} src={part.href} style={props.styles.link}>
          {part.value}
        </Link>,
      );
    } else {
      nodes.push(<Text key={`${part.value}-${index}`}>{part.value}</Text>);
    }
  });
  return <Text style={props.styles.contact}>{nodes}</Text>;
}

export {
  formatDateRange,
  formatHumanDate,
} from "./dates";

export function mergeStyle(
  ...styles: Array<Record<string, unknown> | undefined>
): Array<Record<string, unknown>> {
  return styles.filter(Boolean) as Array<Record<string, unknown>>;
}
