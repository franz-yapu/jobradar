import type { AiCall, AiCallRepository, AiUsageTotals } from "../domain/ai-call.js";

export class InMemoryAiCallRepository implements AiCallRepository {
  readonly calls: AiCall[] = [];

  async save(call: AiCall): Promise<void> {
    this.calls.push(call);
  }

  async totalsSince(userId: string, since: Date): Promise<AiUsageTotals> {
    const rows = this.calls.filter((c) => c.userId === userId && c.status !== "budget_blocked" && c.createdAt >= since);
    return {
      spentUsd: rows.reduce((sum, c) => sum + c.costUsd, 0),
      calls: rows.length,
      inputTokens: rows.reduce((sum, c) => sum + c.inputTokens, 0),
      outputTokens: rows.reduce((sum, c) => sum + c.outputTokens, 0),
    };
  }
}
