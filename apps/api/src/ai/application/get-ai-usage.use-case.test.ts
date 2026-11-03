import { describe, expect, it } from "vitest";
import { InMemoryAiCallRepository } from "../infrastructure/in-memory-ai-call.repository.js";
import { GetAiUsage } from "./get-ai-usage.use-case.js";

function call(costUsd: number, createdAt: string, status: "ok" | "budget_blocked" = "ok") {
  return {
    id: crypto.randomUUID(), purpose: "scoring" as const, model: "m", status, inputTokens: 100, outputTokens: 20,
    cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 1, costUsd, detail: null, createdAt: new Date(createdAt),
  };
}

describe("GetAiUsage", () => {
  it("sums today's spend and tokens, ignoring yesterday and blocked attempts", async () => {
    const repo = new InMemoryAiCallRepository();
    repo.calls.push(
      call(0.1, "2026-03-10T01:00:00Z"),
      call(0.2000004, "2026-03-10T09:00:00Z"),
      call(9, "2026-03-09T23:00:00Z"),
      call(0, "2026-03-10T10:00:00Z", "budget_blocked"),
    );
    const report = await new GetAiUsage(repo, 1.5, () => new Date("2026-03-10T12:00:00Z")).execute();
    expect(report).toEqual({
      date: "2026-03-10", budgetUsd: 1.5, spentUsd: 0.3, calls: 2, inputTokens: 200, outputTokens: 40,
    });
  });

  it("reports zeros on a quiet day", async () => {
    const report = await new GetAiUsage(new InMemoryAiCallRepository(), 1, () => new Date("2026-03-10T00:00:00Z")).execute();
    expect(report).toMatchObject({ date: "2026-03-10", spentUsd: 0, calls: 0, inputTokens: 0, outputTokens: 0 });
  });
});
