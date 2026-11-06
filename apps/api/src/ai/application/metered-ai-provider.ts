import { randomUUID } from "node:crypto";
import { utcDayStart, type AiCall, type AiCallRepository, type AiCallStatus } from "../domain/ai-call.js";
import {
  AiError,
  AiNotConfiguredError,
  AiRefusalError,
  BudgetExceededError,
  ZERO_USAGE,
  type AiProvider,
  type AiResult,
  type AiUsage,
  type GenerateStructuredRequest,
} from "../domain/ai-provider.js";

export interface MeteredOptions {
  /** Per account, per UTC day. */
  dailyBudgetUsd: number;
  /**
   * Optional cap on the spend of ALL accounts together per UTC day. With open registration the per-account cap alone
   * lets N accounts spend N times it; unset keeps the per-account behaviour only.
   */
  globalDailyBudgetUsd?: number | undefined;
  now?: () => Date;
}

/**
 * Decorates any AiProvider with the cross-cutting rules of the project:
 * daily budget enforcement and a log row (tokens, latency, cost) for every attempt.
 * Budget integrity wins over availability: if the log cannot be written the error propagates.
 */
export class MeteredAiProvider implements AiProvider {
  private readonly now: () => Date;

  constructor(
    private readonly inner: AiProvider,
    private readonly calls: AiCallRepository,
    private readonly options: MeteredOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  get model(): string {
    return this.inner.model;
  }

  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<AiResult<T>> {
    const startedAt = this.now();
    const dayStart = utcDayStart(startedAt);
    const { spentUsd } = await this.calls.totalsSince(request.userId, dayStart);
    if (spentUsd >= this.options.dailyBudgetUsd) {
      await this.record(request, this.inner.model, "budget_blocked", ZERO_USAGE, startedAt, "daily budget spent");
      throw new BudgetExceededError(spentUsd, this.options.dailyBudgetUsd);
    }
    const globalCap = this.options.globalDailyBudgetUsd;
    if (globalCap !== undefined) {
      const all = await this.calls.totalsAll(dayStart);
      if (all.spentUsd >= globalCap) {
        await this.record(request, this.inner.model, "budget_blocked", ZERO_USAGE, startedAt, "global daily budget spent");
        throw new BudgetExceededError(all.spentUsd, globalCap);
      }
    }

    let result: AiResult<T>;
    try {
      result = await this.inner.generateStructured(request);
    } catch (error) {
      // Nothing was sent when the provider is not configured, so there is nothing to log.
      if (!(error instanceof AiNotConfiguredError)) {
        const status = error instanceof AiRefusalError ? "refused" : "error";
        const usage = error instanceof AiError && error.usage ? error.usage : ZERO_USAGE;
        await this.record(request, this.inner.model, status, usage, startedAt, describe(error));
      }
      throw error;
    }
    const callId = await this.record(request, result.model, "ok", result.usage, startedAt, null);
    return { ...result, callId };
  }

  private async record<T>(
    request: GenerateStructuredRequest<T>,
    model: string,
    status: AiCallStatus,
    usage: AiUsage,
    startedAt: Date,
    detail: string | null,
  ): Promise<string> {
    const finishedAt = this.now();
    const id = randomUUID();
    await this.calls.save({
      id,
      userId: request.userId,
      purpose: request.purpose,
      model,
      status,
      ...usage,
      latencyMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
      detail,
      createdAt: startedAt,
    } satisfies AiCall);
    return id;
  }
}

function describe(error: unknown): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return message.slice(0, 500);
}
