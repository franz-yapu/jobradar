export const VERDICTS = ["fit", "maybe", "reject"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const BLOCKER_TYPES = ["location", "english", "seniority", "contract", "stack", "other"] as const;
export type BlockerType = (typeof BLOCKER_TYPES)[number];

export interface Blocker {
  readonly type: BlockerType;
  /** Quote or paraphrase from the posting that justifies the blocker. */
  readonly evidence: string;
}

export interface PostingScore {
  readonly id: string;
  readonly postingId: string;
  readonly verdict: Verdict;
  readonly reasons: readonly string[];
  readonly blockers: readonly Blocker[];
  readonly profileVersion: number;
  readonly promptVersion: string;
  readonly model: string;
  readonly aiCallId: string | null;
  readonly createdAt: Date;
}

/**
 * Domain invariant: any blocker forces `reject`, so `fit` always has zero blockers.
 * Enforced here, not in the prompt, so a manipulated posting cannot talk its way into a fit.
 */
export function enforceVerdictInvariant(verdict: Verdict, blockers: readonly Blocker[]): Verdict {
  return blockers.length > 0 ? "reject" : verdict;
}
