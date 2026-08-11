import { validateScoringResult } from './scoring-validator';

describe('validateScoringResult', () => {
  const scores = ['INTEREST', 'QUALITY', 'EVIDENCE', 'ORIGINALITY', 'VIRALITY_POTENTIAL'].map((dimension) => ({ dimension, value: 7, rationale: 'Fixture rationale.' }));
  it('accepts all five independent dimensions', () => expect(validateScoringResult({ scores, allClaimsVerified: true, configVersion: 'ai-v1' }).scores).toHaveLength(5));
  it('rejects duplicate dimensions even when the array length is five', () => expect(() => validateScoringResult({ scores: [...scores.slice(0, 4), scores[0]], allClaimsVerified: true, configVersion: 'ai-v1' })).toThrow());
  it('rejects scores outside zero through ten', () => expect(() => validateScoringResult({ scores: [{ dimension: 'INTEREST', value: 11, rationale: 'bad' }], allClaimsVerified: false, configVersion: 'ai-v1' })).toThrow());
});
