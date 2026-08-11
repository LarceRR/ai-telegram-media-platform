import { postDraftSchema, type PostDraft } from '@atmp/contracts';
import { AppError } from '@atmp/shared';

/** AI output is untrusted input. Invalid structured writing never reaches content state. */
export function validatePostDraft(value: unknown): PostDraft {
  const parsed = postDraftSchema.safeParse(value);
  if (!parsed.success) {
    throw new AppError('CONTRACT_VIOLATION', 'AI writing output failed schema validation', {
      issues: parsed.error.issues.map((issue) => issue.message),
    });
  }
  return parsed.data;
}
