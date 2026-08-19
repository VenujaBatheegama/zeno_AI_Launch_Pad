import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingLeft: 52,
    paddingRight: 52,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#18181b",
    lineHeight: 1.5,
  },
  header: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e4e4e7",
    paddingBottom: 12,
  },
  name: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  contactRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    fontSize: 8.5,
    color: "#64748b",
  },
  dateRow: {
    marginTop: 8,
    marginBottom: 14,
    fontSize: 9,
    color: "#64748b",
  },
  body: {
    marginTop: 4,
  },
  paragraph: {
    marginBottom: 12,
    color: "#334155",
  },
  signatureBlock: {
    marginTop: 16,
  },
  signatureName: {
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginTop: 4,
  },
});

export interface CoverLetterPdfInput {
  candidateName: string;
  contact?: {
    email?: string | null;
    phone?: string | null;
    location?: string | null;
    linkedinUrl?: string | null;
    githubUrl?: string | null;
  };
  jobTitle?: string;
  organizationName?: string | null;
  letterText: string;
}

export function CoverLetterDocument(props: CoverLetterPdfInput) {
  const { candidateName, contact, letterText } = props;
  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const contactItems = [
    contact?.email,
    contact?.phone,
    contact?.location,
    contact?.linkedinUrl ? "LinkedIn" : null,
    contact?.githubUrl ? "GitHub" : null,
  ].filter(Boolean);

  // Split letter text into paragraphs
  const rawParagraphs = letterText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  // Remove trailing signature lines if present in the raw text so we format cleanly
  const paragraphs = rawParagraphs.filter(
    (p) =>
      !/^(sincerely|kind regards|regards|best regards|warm regards),?\s*.*$/i.test(
        p.trim(),
      ),
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header with Candidate Details */}
        <View style={styles.header}>
          <Text style={styles.name}>{candidateName}</Text>
          {contactItems.length > 0 && (
            <View style={styles.contactRow}>
              {contactItems.map((item, idx) => (
                <Text key={idx}>{item}{idx < contactItems.length - 1 ? "  •  " : ""}</Text>
              ))}
            </View>
          )}
        </View>

        {/* Date */}
        <Text style={styles.dateRow}>{today}</Text>

        {/* Letter Body */}
        <View style={styles.body}>
          {paragraphs.map((para, index) => (
            <Text key={index} style={styles.paragraph}>
              {para}
            </Text>
          ))}
        </View>

        {/* Signature */}
        <View style={styles.signatureBlock}>
          <Text style={styles.paragraph}>Sincerely,</Text>
          <Text style={styles.signatureName}>{candidateName}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderCoverLetterPdf(
  input: CoverLetterPdfInput,
): Promise<Uint8Array> {
  const buffer = await renderToBuffer(
    <CoverLetterDocument {...input} />,
  );
  return new Uint8Array(buffer);
}
