import { researchDecisionSchema, researchJobSchema, researchLevelSchema } from './research';

describe('research contracts', () => {
  it('allows only levels zero through three', () => {
    expect(researchLevelSchema.parse(0)).toBe(0);
    expect(researchLevelSchema.parse(3)).toBe(3);
    expect(() => researchLevelSchema.parse(4)).toThrow();
  });

  it('requires a rationale and config version', () => {
    expect(() => researchDecisionSchema.parse({ level: 2, requiredEvidenceCount: 1, mandatoryIndependentSource: true })).toThrow();
    expect(researchDecisionSchema.parse({ level: 1, rationale: 'One source is sufficient for a low-risk update.', requiredEvidenceCount: 1, mandatoryIndependentSource: false, configVersion: 'research-v1' }).level).toBe(1);
  });

  it('validates a typed research job envelope', () => {
    const job = researchJobSchema.parse({ correlationId: '3f0f8f6a-2b1a-4f3e-9b5c-7d8e9f0a1b2c', enqueuedAt: new Date().toISOString(), enqueuedBy: 'worker', channelId: '11111111-1111-4111-8111-111111111111', ideaId: '22222222-2222-4222-8222-222222222222', level: 2, configVersion: 'research-v1' });
    expect(job.level).toBe(2);
  });
});
