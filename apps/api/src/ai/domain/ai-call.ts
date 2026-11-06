import type { AiPurpose } from "./ai-provider.js";

export const AI_CALL_REPOSITORY = Symbol("AI_CALL_REPOSITORY");

export type AiCallStatus = "ok" | "error" | "refused" | "budget_blocked";

export interface AiCall {
  readonly id: string;
  readonly userId: string;
  readonly purpose: AiPurpose;
  readonly model: string;
  readonly status: AiCallStatus;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly latencyMs: number;
  readonly costUsd: number;
  /** Short explanation for non-ok calls. */
  readonly detail: string | null;
  readonly createdAt: Date;
}

export interface AiUsageTotals {
  spentUsd: number;
  /** Calls that reached the provider (budget-blocked attempts are not counted). */
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export interface AiCallRepository {
  save(call: AiCall): Promise<void>;
  /** Spend and tokens of ONE account since the instant (the budget is per account). */
  totalsSince(userId: string, since: Date): Promise<AiUsageTotals>;
  /** Spend and tokens of ALL accounts together since the instant (the global cap that bounds open registration). */
  totalsAll(since: Date): Promise<AiUsageTotals>;
}

/** Start (00:00 UTC) of the day containing `date`; the budget window. */
export function utcDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
