import { utcDayStart, type AiCallRepository, type AiUsageTotals } from "../domain/ai-call.js";

export interface AiUsageReport extends AiUsageTotals {
  /** UTC day, YYYY-MM-DD. */
  date: string;
  budgetUsd: number;
}

export class GetAiUsage {
  constructor(
    private readonly calls: AiCallRepository,
    private readonly dailyBudgetUsd: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<AiUsageReport> {
    const dayStart = utcDayStart(this.now());
    const totals = await this.calls.totalsSince(dayStart);
    return {
      date: dayStart.toISOString().slice(0, 10),
      budgetUsd: this.dailyBudgetUsd,
      ...totals,
      spentUsd: Math.round(totals.spentUsd * 1e6) / 1e6,
    };
  }
}
