import { describe, expect, it } from "vitest";
import { buildSkillInventory } from "./skill-inventory";
import type { EvidenceSnapshot } from "./facts";

describe("buildSkillInventory", () => {
  it("extracts clean skills and drops sentence-like fragments", () => {
    const mockSnapshot = {
      profile: {},
      items: [
        {
          id: "item_1",
          type: "skill",
          name: "RESTful API Development",
          factIds: [],
        },
        {
          id: "item_2",
          type: "skill",
          name: "Live deployed cloud endpoint",
          factIds: [],
        },
        {
          id: "item_3",
          type: "skill",
          name: "Design tools :",
          factIds: [],
        },
        {
          id: "item_4",
          type: "skill",
          name: "CI/CD Pipeline",
          factIds: [],
        },
      ],
      facts: [],
    } as unknown as EvidenceSnapshot;

    const inventory = buildSkillInventory(mockSnapshot);

    expect(inventory.displayNames).toContain("RESTful API Development");
    expect(inventory.displayNames).toContain("CI/CD Pipeline");
    expect(inventory.displayNames).not.toContain("Live deployed cloud endpoint");
    expect(inventory.displayNames).not.toContain("Design tools :");
  });
});
