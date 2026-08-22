import { Document, Font, Page, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

import type { ContentPlan } from "../../domain/content-plan";
import { defaultResumeSectionOrder } from "../../domain/resume-section-order";
import type { TailoredResume } from "../../domain/tailored-resume";
import {
  BulletList,
  ContactLine,
  Section,
  createResumeStyles,
  formatDateRange,
  formatHumanDate,
} from "./components";
import { getResumeTokens, type ResumeDensity } from "./tokens";

// Disable hyphenation so tech names / URLs stay intact.
Font.registerHyphenationCallback((word) => [word]);

export function ProfessionalSingleColumnResume(props: {
  resume: TailoredResume;
  plan?: Pick<ContentPlan, "sectionOrder" | "mode" | "earlyCareer">;
  density?: ResumeDensity;
  debug?: boolean;
}) {
  const density = props.density ?? "comfortable";
  const tokens = getResumeTokens(density);
  const styles = createResumeStyles(tokens);
  const contactParts = [
    props.resume.contact.email
      ? {
          value: props.resume.contact.email,
          href: `mailto:${props.resume.contact.email}`,
        }
      : null,
    props.resume.contact.phone ? { value: props.resume.contact.phone } : null,
    props.resume.contact.location
      ? { value: props.resume.contact.location }
      : null,
    props.resume.contact.linkedinUrl
      ? { value: "LinkedIn", href: props.resume.contact.linkedinUrl }
      : null,
    props.resume.contact.githubUrl
      ? { value: "GitHub", href: props.resume.contact.githubUrl }
      : null,
    props.resume.contact.portfolioUrl
      ? { value: "Portfolio", href: props.resume.contact.portfolioUrl }
      : null,
  ].filter(Boolean) as Array<{ value: string; href?: string }>;

  const sectionOrder = (
    props.plan?.sectionOrder?.filter((section) => section !== "contact") ??
    defaultResumeSectionOrder(props.plan?.mode, props.plan?.earlyCareer)
  ).filter((section) => {
    // One-page CVs never include references — they waste page budget.
    if (section === "references" && props.plan?.mode === "one_page") return false;
    return true;
  });

  const isOnePage = props.plan?.mode === "one_page";

  const sections: Record<string, ReactNode> = {
    summary: (
      <Section
        key="summary"
        title="Professional Summary"
        styles={styles}
        minPresenceAhead={isOnePage ? 0 : 56}
      >
        <Text style={styles.body}>{props.resume.summary.text}</Text>
      </Section>
    ),
    skills:
      props.resume.skills.length > 0 ? (
        <Section
          key="skills"
          title="Technical Skills"
          styles={styles}
          minPresenceAhead={isOnePage ? 0 : 40}
        >
          {props.resume.skills.map((group) => (
            <Text key={group.category} style={styles.skillRow} wrap>
              <Text style={styles.skillCategory}>{group.category}: </Text>
              {group.items.join(", ")}
            </Text>
          ))}
        </Section>
      ) : null,
    experience:
      props.resume.experience.length > 0 ? (
        <Section
          key="experience"
          title="Experience"
          styles={styles}
          minPresenceAhead={isOnePage ? 0 : 48}
        >
          {props.resume.experience.map((role) => (
            <View
              key={role.id}
              style={styles.entry}
              wrap={false}
              minPresenceAhead={isOnePage ? 0 : 72}
            >
              <View style={styles.entryHeaderRow}>
                <Text style={styles.entryTitle}>{role.title}</Text>
                <Text style={styles.entryMeta}>
                  {formatDateRange(role.startDate, role.endDate, role.isCurrent)}
                </Text>
              </View>
              <Text style={styles.entrySub}>
                {[role.employer, role.location].filter(Boolean).join(" · ")}
              </Text>
              <BulletList
                items={role.bullets.map((bullet) => bullet.text)}
                styles={styles}
              />
            </View>
          ))}
        </Section>
      ) : null,
    education:
      props.resume.education.length > 0 ? (
        <Section
          key="education"
          title="Education"
          styles={styles}
          minPresenceAhead={isOnePage ? 0 : 36}
        >
          {props.resume.education.map((item, index) => (
            <View
              key={item.id ?? `${item.institution}-${index}`}
              style={styles.entry}
              wrap={false}
              minPresenceAhead={isOnePage ? 0 : 48}
            >
              <View style={styles.entryHeaderRow}>
                <Text style={styles.entryTitle}>
                  {item.qualification || item.institution}
                </Text>
                <Text style={styles.entryMeta}>
                  {formatDateRange(item.startDate, item.endDate)}
                </Text>
              </View>
              <Text style={styles.entrySub}>{item.institution}</Text>
              {item.details.length > 0 ? (
                <BulletList items={item.details} styles={styles} />
              ) : null}
            </View>
          ))}
        </Section>
      ) : null,
    projects:
      props.resume.projects.length > 0 ? (
        <View key="projects" style={styles.section} wrap>
          <View wrap={false} minPresenceAhead={isOnePage ? 0 : 160}>
            <Text style={styles.sectionHeading}>Selected Projects</Text>
            <View style={styles.rule} />
            {renderProject(props.resume.projects[0]!, styles)}
          </View>
          {props.resume.projects.slice(1).map((project) => (
            <View
              key={project.id}
              wrap={false}
              minPresenceAhead={isOnePage ? 0 : 88}
            >
              {renderProject(project, styles)}
            </View>
          ))}
        </View>
      ) : null,
    certifications:
      props.resume.certifications.length > 0 ? (
        <Section key="certifications" title="Certifications" styles={styles}>
          {props.resume.certifications.map((item, index) => (
            <Text
              key={item.id ?? `${item.name}-${index}`}
              style={styles.body}
              wrap={false}
            >
              {item.name}
              {item.issuer ? ` - ${item.issuer}` : ""}
              {item.date ? ` (${formatHumanDate(item.date)})` : ""}
            </Text>
          ))}
        </Section>
      ) : null,
    achievements:
      props.resume.achievements.length > 0 ? (
        <Section key="achievements" title="Achievements" styles={styles}>
          <BulletList
            items={props.resume.achievements.map((item) => item.text)}
            styles={styles}
          />
        </Section>
      ) : null,
    references:
      props.resume.references.length > 0 ? (
        <View key="references" style={styles.referenceSection} wrap={false}>
          <Text style={styles.sectionHeading}>References</Text>
          <View style={styles.rule} />
          <View style={styles.referenceRow}>
            {props.resume.references.map((referee, index) => {
              const roleLine = [referee.title, referee.organization]
                .filter(Boolean)
                .join(" · ");
              const contactLine = [referee.email, referee.phone]
                .filter(Boolean)
                .join(" · ");
              return (
                <View
                  key={referee.id}
                  style={
                    index % 2 === 0
                      ? [styles.referenceColumn, styles.referenceColumnLeft]
                      : styles.referenceColumn
                  }
                >
                  <Text style={styles.referenceName}>{referee.name}</Text>
                  {roleLine ? (
                    <Text style={styles.referenceMeta}>{roleLine}</Text>
                  ) : null}
                  {contactLine ? (
                    <Text style={styles.referenceMeta}>{contactLine}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      ) : null,
  };

  return (
    <Document
      title={`${props.resume.contact.fullName} - ${props.resume.targetTitle}`}
      author={props.resume.contact.fullName}
      subject={`Tailored CV for ${props.resume.targetTitle}`}
    >
      <Page size={tokens.page.size} style={styles.page} wrap debug={props.debug}>
        <View style={{ marginBottom: tokens.space.afterHeader }} wrap={false}>
          <Text style={styles.name}>{props.resume.contact.fullName}</Text>
          <Text style={styles.targetTitle}>{props.resume.targetTitle}</Text>
          {contactParts.length > 0 ? (
            <ContactLine parts={contactParts} styles={styles} />
          ) : null}
        </View>

        {sectionOrder.map((key) => sections[key] ?? null)}
      </Page>
    </Document>
  );
}

function renderProject(
  project: TailoredResume["projects"][number],
  styles: ReturnType<typeof createResumeStyles>,
) {
  return (
    <View style={styles.entry}>
      <View style={styles.entryHeaderRow}>
        <Text style={styles.entryTitle}>{project.name}</Text>
        <Text style={styles.entryMeta}>
          {project.url
            ? project.url.replace(/^https?:\/\//u, "")
            : formatDateRange(project.startDate, project.endDate)}
        </Text>
      </View>
      {project.technologies.length > 0 ? (
        <Text style={styles.techLine}>{project.technologies.join(", ")}</Text>
      ) : null}
      {project.paragraphs.map((paragraph, index) => (
        <Text
          key={`${project.id}-p-${index}`}
          style={styles.projectParagraph}
          wrap
        >
          {paragraph.text}
        </Text>
      ))}
    </View>
  );
}

/** Helper export for typed children in presentational wrappers. */
export type ResumeChild = ReactNode;
