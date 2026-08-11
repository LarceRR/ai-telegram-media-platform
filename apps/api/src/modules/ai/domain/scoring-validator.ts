import { scoringResultSchema, type ScoringResult } from '@atmp/contracts';
import { AppError } from '@atmp/shared';

export function validateScoringResult(value: unknown): ScoringResult {
  const parsed = scoringResultSchema.safeParse(value);
  if (!parsed.success) throw new AppError('CONTRACT_VIOLATION', 'AI scoring output failed schema validation', { issues: parsed.error.issues.map((issue) => issue.message) });
  const dimensions = parsed.data.scores.map((score) => score.dimension);
  if (new Set(dimensions).size !== 5) throw new AppError('CONTRACT_VIOLATION', 'AI scoring output has duplicate dimensions');
  return parsed.data;
}
