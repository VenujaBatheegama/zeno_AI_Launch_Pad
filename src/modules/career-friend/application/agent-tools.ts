import { z } from "zod";

export const GenerateCvToolSchema = z.object({
  mode: z
    .enum(["one_page", "two_page"])
    .default("one_page")
    .describe(
      "The page length format of the CV. Use 'two_page' if the user requested a 2-page, two pages, detailed, or comprehensive CV. Use 'one_page' if they requested 1-page, single page, concise, or default format.",
    ),
  jobTitle: z
    .string()
    .optional()
    .describe("The target job title or professional title to position the CV for."),
  organizationName: z
    .string()
    .optional()
    .describe("The target company name if tailoring for a specific organization."),
  jobDescription: z
    .string()
    .optional()
    .describe("The job description or key requirements to tailor the CV against."),
  focusAreas: z
    .array(z.string())
    .optional()
    .describe("Specific skills or domains to emphasize (e.g. ['Cloud', 'Kubernetes', 'Backend'])."),
});

export type GenerateCvToolInput = z.infer<typeof GenerateCvToolSchema>;

export const GenerateCoverLetterToolSchema = z.object({
  jobTitle: z
    .string()
    .describe("The job title the cover letter is written for."),
  organizationName: z
    .string()
    .optional()
    .describe("The target company or organization name."),
  jobDescription: z
    .string()
    .optional()
    .describe("The job description, responsibilities, or posting text."),
});

export type GenerateCoverLetterToolInput = z.infer<typeof GenerateCoverLetterToolSchema>;

export const SearchJobsToolSchema = z.object({
  query: z
    .string()
    .describe("Search query terms (e.g. 'React Developer', 'DevOps', 'Data Scientist')."),
  location: z
    .string()
    .optional()
    .describe("Desired location or country (e.g. 'London', 'Berlin', 'Sri Lanka', 'Remote')."),
  workMode: z
    .enum(["remote", "hybrid", "onsite", "any"])
    .optional()
    .describe("Work mode preference."),
});

export type SearchJobsToolInput = z.infer<typeof SearchJobsToolSchema>;

export const GrowthSprintToolSchema = z.object({
  action: z
    .enum(["recommend", "start", "status"])
    .describe("Action to take on growth sprints."),
  skillGap: z
    .string()
    .optional()
    .describe("The specific skill or technology to bridge (e.g. 'GraphQL', 'AWS CDK')."),
  targetRole: z
    .string()
    .optional()
    .describe("The role being targeted that requires this skill."),
});

export type GrowthSprintToolInput = z.infer<typeof GrowthSprintToolSchema>;

export const ManageCampaignToolSchema = z.object({
  action: z
    .enum(["create", "list", "pause"])
    .describe("Action to take on career search campaigns."),
  keywords: z
    .string()
    .optional()
    .describe("Keywords for the campaign search."),
  location: z
    .string()
    .optional()
    .describe("Location filter for the campaign."),
});

export type ManageCampaignToolInput = z.infer<typeof ManageCampaignToolSchema>;
