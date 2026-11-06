import type { Prisma } from "../../generated/prisma/client.js";
import type { PrismaService } from "../../shared/infrastructure/prisma/prisma.service.js";
import type { AiCall, AiCallRepository, AiUsageTotals } from "../domain/ai-call.js";

export class PrismaAiCallRepository implements AiCallRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(call: AiCall): Promise<void> {
    await this.prisma.aiCall.create({ data: call });
  }

  async totalsSince(userId: string, since: Date): Promise<AiUsageTotals> {
    return this.totals({ userId, createdAt: { gte: since }, status: { not: "budget_blocked" } });
  }

  async totalsAll(since: Date): Promise<AiUsageTotals> {
    return this.totals({ createdAt: { gte: since }, status: { not: "budget_blocked" } });
  }

  private async totals(where: Prisma.AiCallWhereInput): Promise<AiUsageTotals> {
    const result = await this.prisma.aiCall.aggregate({
      where,
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      _count: { _all: true },
    });
    return {
      spentUsd: Number(result._sum.costUsd ?? 0),
      calls: result._count._all,
      inputTokens: result._sum.inputTokens ?? 0,
      outputTokens: result._sum.outputTokens ?? 0,
    };
  }
}
