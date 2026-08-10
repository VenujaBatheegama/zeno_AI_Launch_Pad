import { describe, expect, it } from "vitest";

import {
  distillBullets,
  distillTechnologies,
  extractTechnologies,
  isLowValueCvText,
} from "./distill-cv-content";
import { applyProfileOperations } from "./profile-operations";
import { emptyCareerEvidence } from "./conversation-machine";

describe("distillCvContent", () => {
  it("keeps the tech gist and drops no-CI/CD asides", () => {
    const raw =
      "c# ,.net Core was the main backend and we had an angular frontend. we did use mssql for db. we didnt have any cicd";

    expect(extractTechnologies(raw)).toEqual([
      "C#",
      ".NET Core",
      "Angular",
      "MSSQL",
    ]);
    expect(distillBullets(raw)).toEqual([
      "Used C#, .NET Core, Angular, and MSSQL",
    ]);
    expect(distillTechnologies(raw)).toEqual([
      "C#",
      ".NET Core",
      "Angular",
      "MSSQL",
    ]);
    expect(isLowValueCvText("we didnt have any cicd")).toBe(true);
  });

  it("applies distillation when writing experience bullets", () => {
    const created = applyProfileOperations({
      evidence: emptyCareerEvidence(),
      operations: [
        {
          operation: "create",
          entityType: "experience",
          temporaryRecordId: "tmp-1",
          fields: {
            role: "Backend Developer",
            employer: "XYZ",
            bullets: [
              "c# ,.net Core was the main backend and we had an angular frontend. we did use mssql for db. we didnt have any cicd",
            ],
          },
        },
      ],
    });

    expect(created.evidence.work_experience[0]?.bullets).toEqual([
      "Used C#, .NET Core, Angular, and MSSQL",
    ]);
  });
});
