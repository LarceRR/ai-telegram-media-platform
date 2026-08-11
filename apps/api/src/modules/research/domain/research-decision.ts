import { RESEARCH_CONFIG_VERSION, researchDecisionSchema, type ResearchDecision, type ResearchLevel } from '@atmp/contracts';

export interface ResearchSubject { risk: 'LOW' | 'MEDIUM' | 'HIGH'; hasContradiction: boolean; sourceCount: number; claimCount: number; }

/** Deterministic policy. AI may collect evidence later, but it cannot override this gate. */
export function decideResearch(subject: ResearchSubject, configVersion = RESEARCH_CONFIG_VERSION): ResearchDecision {
  let level: ResearchLevel = 0;
  if (subject.risk === 'MEDIUM' || subject.claimCount > 2 || subject.sourceCount === 0) level = 1;
  if (subject.risk === 'HIGH' || subject.hasContradiction || subject.claimCount > 5) level = 2;
  if (subject.hasContradiction && subject.risk === 'HIGH') level = 3;
  const result = { level, rationale: rationale(level, subject), requiredEvidenceCount: level === 0 ? 0 : level === 1 ? 1 : level === 2 ? 2 : 3, mandatoryIndependentSource: level >= 2, configVersion };
  return researchDecisionSchema.parse(result);
}

function rationale(level: ResearchLevel, subject: ResearchSubject): string {
  if (level === 3) return 'High-risk material contains contradictory signals and requires primary or independent evidence.';
  if (level === 2) return 'High-risk, contradictory or claim-dense material requires independent corroboration.';
  if (level === 1) return subject.sourceCount === 0 ? 'No source evidence is available yet.' : 'The candidate needs limited corroboration before generation.';
  return 'Low-risk candidate has sufficient source context for baseline processing.';
}
