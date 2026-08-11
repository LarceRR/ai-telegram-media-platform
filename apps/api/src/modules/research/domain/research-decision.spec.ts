import { decideResearch } from './research-decision';

describe('decideResearch', () => {
  it('keeps a low-risk, sourced item at level zero', () => expect(decideResearch({ risk: 'LOW', hasContradiction: false, sourceCount: 1, claimCount: 1 }).level).toBe(0));
  it('requires evidence when no source is available', () => expect(decideResearch({ risk: 'LOW', hasContradiction: false, sourceCount: 0, claimCount: 1 }).level).toBe(1));
  it('requires independent evidence for high-risk content', () => expect(decideResearch({ risk: 'HIGH', hasContradiction: false, sourceCount: 1, claimCount: 1 }).mandatoryIndependentSource).toBe(true));
  it('uses level three for high-risk contradictions', () => expect(decideResearch({ risk: 'HIGH', hasContradiction: true, sourceCount: 1, claimCount: 1 }).level).toBe(3));
});
