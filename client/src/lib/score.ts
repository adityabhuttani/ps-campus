import { ScoringCriterion } from "./types";

// Mirrors the server's weightedScore() so the Scoring page can show a live
// final score as the panelist types, without a round trip per keystroke. The
// server stays the source of truth for anything persisted or reported on.
export function weightedScore(
  criteria: Pick<ScoringCriterion, "id" | "weight">[],
  scores: { criterionId: string; score: number }[]
): number {
  const byCriterion = new Map(scores.map((s) => [s.criterionId, s.score]));
  let total = 0;
  for (const criterion of criteria) {
    const score = byCriterion.get(criterion.id);
    if (score == null) continue;
    total += score * criterion.weight;
  }
  return total;
}

// Weights sum to 1 and scores run 1-5, so a complete sheet lands in 1.0-5.0.
export function formatScore(value: number): string {
  return value.toFixed(2);
}
