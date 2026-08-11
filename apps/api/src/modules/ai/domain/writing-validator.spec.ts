import { validatePostDraft } from './writing-validator';

describe('validatePostDraft', () => {
  const valid = {
    title: 'A verified update',
    body: 'The central bank announced a rate decision.',
    claims: [{ text: 'The central bank announced a rate decision.', status: 'SUPPORTED', evidenceIds: ['11111111-1111-4111-8111-111111111111'], confidence: 0.9 }],
    sourceStoryId: '22222222-2222-4222-8222-222222222222',
    promptVersion: 'writing-v1',
  };
  it('accepts a complete typed draft', () => expect(validatePostDraft(valid).promptVersion).toBe('writing-v1'));
  it('rejects claims without evidence status', () => expect(() => validatePostDraft({ ...valid, claims: [{ text: 'unsupported' }] })).toThrow());
  it('rejects invalid source provenance', () => expect(() => validatePostDraft({ ...valid, sourceStoryId: 'not-a-uuid' })).toThrow());
});
