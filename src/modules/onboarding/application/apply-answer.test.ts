import { describe, expect, it } from "vitest";

import { applyConversationAnswer } from "./apply-answer";
import { emptyCareerEvidence } from "../domain/conversation-machine";

describe("applyConversationAnswer", () => {
  it("captures name and advances about-you basics", () => {
    const result = applyConversationAnswer({
      stage: "about_you",
      questionKey: "full_name",
      answer: "Venuja Perera",
      evidence: emptyCareerEvidence(),
    });
    expect(result.evidence.profile.full_name).toBe("Venuja Perera");
  });

  it("adds experience and then accepts bullets without overwriting later manual edits", () => {
    const afterRole = applyConversationAnswer({
      stage: "experience",
      questionKey: "experience_entry",
      answer: "Software Developer Intern at Teejay Lanka",
      evidence: emptyCareerEvidence(),
    });
    expect(afterRole.evidence.work_experience).toHaveLength(1);

    const afterBullets = applyConversationAnswer({
      stage: "experience",
      questionKey: "experience_bullets",
      answer: "Maintained internal .NET applications and fixed reporting bugs.",
      evidence: afterRole.evidence,
    });
    expect(afterBullets.evidence.work_experience[0]?.bullets.length).toBeGreaterThan(
      0,
    );

    const manual = structuredClone(afterBullets.evidence);
    manual.work_experience[0]!.role = "Software Engineer Intern";
    // A later unrelated answer should not wipe the manual role when applying skills.
    const afterSkills = applyConversationAnswer({
      stage: "skills",
      questionKey: "skills_entry",
      answer: "C#, SQL Server, .NET Core",
      evidence: manual,
    });
    expect(afterSkills.evidence.work_experience[0]?.role).toBe(
      "Software Engineer Intern",
    );
    expect(afterSkills.evidence.skills.map((skill) => skill.name)).toEqual(
      expect.arrayContaining(["C#", "SQL Server", ".NET Core"]),
    );
  });
});
