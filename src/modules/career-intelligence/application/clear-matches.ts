import { z } from "zod";

import type { CareerIntelligenceRepository } from "./ports";

const schema = z.object({
  userId: z.uuid(),
});

export type ClearMatchAnalysesCommand = z.input<typeof schema>;

export async function clearMatchAnalysesForUser(
  command: ClearMatchAnalysesCommand,
  repository: CareerIntelligenceRepository,
): Promise<{ removed: number }> {
  const parsed = schema.parse(command);
  const removed = await repository.clearMatchAnalyses(parsed.userId);
  return { removed };
}
