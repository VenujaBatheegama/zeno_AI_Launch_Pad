import { describe, expect, it } from "vitest";

import { GroqCoverLetterGenerator } from "./groq-cover-letter-generator";

describe("GroqCoverLetterGenerator", () => {
  it("produces a high-quality deterministic fallback when AI is unavailable", async () => {
    const generator = new GroqCoverLetterGenerator(["mock-key"], "test-model");
    const mockEvidence = {
      profile: {
        full_name: "Venuja Batheegama",
        summary: "Passionate developer with strong analytical skills.",
      },
      projects: [
        {
          name: "Performance Monitoring System",
          technologies: ["Spring Boot", "Java", "Docker"],
          bullets: ["Designed real-time analytics dashboard for enterprise metrics."],
        },
      ],
      work_experience: [],
      skills: [{ name: "Java" }, { name: "Spring Boot" }, { name: "Dart" }],
      education: [
        {
          institution: "Informatics Institute of Technology",
          qualification: "B.Sc. Computer Science",
        },
      ],
    };

    const result = await generator.generate({
      evidenceJson: mockEvidence,
      jobTitle: "Software Engineer",
      organizationName: "Ceyentra Technologies",
      jobDescription: "Looking for a Software Engineer proficient in backend APIs and microservices.",
      matchedRequirements: ["Java and Spring Boot experience", "Understanding of Docker"],
      missingRequirements: ["3+ years of AWS experience"],
      applicationUrl: null,
    });

    expect(result.draft).toContain("Dear Hiring Team,");
    expect(result.draft).toContain("Software Engineer position at Ceyentra Technologies");
    expect(result.draft).toContain("Performance Monitoring System");
    expect(result.draft).toContain("Spring Boot, Java, Docker");
    expect(result.draft).toContain("Venuja Batheegama");
    expect(result.draft).not.toContain("Verified work evidence specifically mentions");
    expect(result.meta.model).toBe("deterministic-fallback");
  });
});
