import { describe, expect, it } from "vitest";

import { emptyCareerEvidence } from "./conversation-machine";
import { applyProfileOperations } from "./profile-operations";

describe("applyProfileOperations", () => {
  it("creates an experience and updates the same focused record across turns", () => {
    const created = applyProfileOperations({
      evidence: emptyCareerEvidence(),
      operations: [
        {
          operation: "create",
          entityType: "experience",
          temporaryRecordId: "tmp-exp-1",
          fields: {
            role: "Software Developer Intern",
            employer: "Teejay Lanka",
          },
        },
      ],
    });

    expect(created.evidence.work_experience).toHaveLength(1);
    expect(created.focusedEntityId).toBeTruthy();
    const id = created.focusedEntityId!;

    const updated = applyProfileOperations({
      evidence: created.evidence,
      recordRevisions: created.recordRevisions,
      focusedEntityId: id,
      operations: [
        {
          operation: "update",
          entityType: "experience",
          recordId: id,
          expectedRevision: 1,
          fields: {
            bullets: ["Maintained internal .NET applications"],
            append_bullets: false,
          },
        },
      ],
    });

    expect(updated.evidence.work_experience).toHaveLength(1);
    expect(updated.evidence.work_experience[0]?.bullets).toEqual([
      "Maintained internal .NET applications",
    ]);
    expect(updated.recordRevisions[id]).toBe(2);
  });

  it("adds multiple skills from one create and skips duplicates", () => {
    const first = applyProfileOperations({
      evidence: emptyCareerEvidence(),
      operations: [
        {
          operation: "create",
          entityType: "skill",
          temporaryRecordId: "tmp-skills",
          fields: {
            names: ["Java", "Python", "React", "Git"],
          },
        },
      ],
    });

    expect(first.evidence.skills.map((skill) => skill.name)).toEqual([
      "Java",
      "Python",
      "React",
      "Git",
    ]);

    const second = applyProfileOperations({
      evidence: first.evidence,
      recordRevisions: first.recordRevisions,
      operations: [
        {
          operation: "create",
          entityType: "skill",
          temporaryRecordId: "tmp-skills-2",
          fields: { names: ["React", "Docker"] },
        },
      ],
    });

    expect(second.evidence.skills.map((skill) => skill.name)).toEqual([
      "Java",
      "Python",
      "React",
      "Git",
      "Docker",
    ]);
  });

  it("rejects stale updates when revision does not match", () => {
    const created = applyProfileOperations({
      evidence: emptyCareerEvidence(),
      operations: [
        {
          operation: "create",
          entityType: "experience",
          temporaryRecordId: "tmp",
          fields: { role: "Intern", employer: "Acme" },
        },
      ],
    });
    const id = created.focusedEntityId!;

    const manual = applyProfileOperations({
      evidence: created.evidence,
      recordRevisions: created.recordRevisions,
      operations: [
        {
          operation: "update",
          entityType: "experience",
          recordId: id,
          expectedRevision: 1,
          fields: { employer: "Acme PLC" },
        },
      ],
    });

    const stale = applyProfileOperations({
      evidence: manual.evidence,
      recordRevisions: manual.recordRevisions,
      operations: [
        {
          operation: "update",
          entityType: "experience",
          recordId: id,
          expectedRevision: 1,
          fields: { employer: "Old Name" },
        },
      ],
    });

    expect(stale.rejected).toHaveLength(1);
    expect(stale.evidence.work_experience[0]?.employer).toBe("Acme PLC");
  });

  it("removes a skill by id", () => {
    const created = applyProfileOperations({
      evidence: emptyCareerEvidence(),
      operations: [
        {
          operation: "create",
          entityType: "skill",
          temporaryRecordId: "s1",
          fields: { names: ["Java", "Python"] },
        },
      ],
    });
    const javaId = created.evidence.skills.find((skill) => skill.name === "Java")!.id;

    const removed = applyProfileOperations({
      evidence: created.evidence,
      recordRevisions: created.recordRevisions,
      operations: [
        {
          operation: "remove",
          entityType: "skill",
          recordId: javaId,
        },
      ],
    });

    expect(removed.evidence.skills.map((skill) => skill.name)).toEqual(["Python"]);
  });
});
