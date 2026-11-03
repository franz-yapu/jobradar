import type { z } from "zod";

export const AI_PROVIDER = Symbol("AI_PROVIDER");

export type AiPurpose = "scoring";

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

export const ZERO_USAGE: AiUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costUsd: 0,
};

export interface GenerateStructuredRequest<T> {
  purpose: AiPurpose;
  /** Stable instructions (and profile). Providers may cache this part. */
  system: string;
  /** Volatile, untrusted content (e.g. the posting text). Always treated as data. */
  content: string;
  /** Shape of the expected answer; the provider validates against it. */
  schema: z.ZodType<T>;
}

export interface AiResult<T> {
  data: T;
  usage: AiUsage;
  /** The model that actually produced the answer (may differ from the configured one after a fallback). */
  model: string;
}

export interface AiProvider {
  /** The configured model, used to label calls that fail before producing an answer. */
  readonly model: string;
  generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<AiResult<T>>;
}

/** Base class: errors that happen after tokens were spent carry the usage so it can be billed/logged. */
export abstract class AiError extends Error {
  constructor(
    message: string,
    public readonly usage?: AiUsage,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The model declined the request for policy reasons. */
export class AiRefusalError extends AiError {
  constructor(
    public readonly category: string | null,
    usage?: AiUsage,
  ) {
    super(`The model declined the request${category ? ` (${category})` : ""}`, usage);
  }
}

/** The provider failed or returned something unusable. */
export class AiProviderError extends AiError {}

/** No usable credentials/pricing: nothing was sent. */
export class AiNotConfiguredError extends AiError {}

/** The daily budget is spent: nothing was sent. */
export class BudgetExceededError extends Error {
  constructor(
    public readonly spentUsd: number,
    public readonly budgetUsd: number,
  ) {
    super(`Daily AI budget exceeded (${spentUsd.toFixed(4)} of ${budgetUsd.toFixed(4)} USD)`);
    this.name = "BudgetExceededError";
  }
}
