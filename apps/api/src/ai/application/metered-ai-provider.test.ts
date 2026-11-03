import { z } from "zod";
import { beforeEach, describe, expect, it } from "vitest";
import type { AiCall } from "../domain/ai-call.js";
import {
  AiNotConfiguredError,
  AiProviderError,
  AiRefusalError,
  BudgetExceededError,
  type AiProvider,
  type GenerateStructuredRequest,
} from "../domain/ai-provider.js";
import { FakeAiProvider } from "../infrastructure/fake-ai.provider.js";
import { InMemoryAiCallRepository } from "../infrastructure/in-memory-ai-call.repository.js";
import { MeteredAiProvider } from "./metered-ai-provider.js";

const request: GenerateStructuredRequest<{ ok: boolean }> = {
  purpose: "scoring",
  system: "system",
  content: "content",
  schema: z.object({ ok: z.boolean() }),
};
const usage = { inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheWriteTokens: 5, costUsd: 0.02 };

let clock: number;
let fake: FakeAiProvider;
let calls: InMemoryAiCallRepository;
const now = () => new Date(clock);

/** Wraps the fake so each call takes 250 ms of fake time. */
function slow(inner: FakeAiProvider): AiProvider {
  return {
    model: inner.model,
    generateStructured: async (r) => {
      clock += 250;
      return inner.generateStructured(r);
    },
  };
}

function metered(budget = 1): MeteredAiProvider {
  return new MeteredAiProvider(slow(fake), calls, { dailyBudgetUsd: budget, now });
}

function seed(costUsd: number, createdAt = new Date(clock), status: AiCall["status"] = "ok"): void {
  calls.calls.push({
    id: crypto.randomUUID(), purpose: "scoring", model: "m", status, inputTokens: 1, outputTokens: 1,
    cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 1, costUsd, detail: null, createdAt,
  });
}

beforeEach(() => {
  clock = Date.parse("2026-03-10T12:00:00Z");
  fake = new FakeAiProvider();
  calls = new InMemoryAiCallRepository();
});

describe("MeteredAiProvider logging", () => {
  it("returns the answer and logs tokens, cost, latency and model", async () => {
    fake.willReturn({ ok: true }, usage, "served-model");
    const result = await metered().generateStructured(request);

    expect(result.data).toEqual({ ok: true });
    expect(calls.calls).toHaveLength(1);
    expect(calls.calls[0]).toMatchObject({
      purpose: "scoring", model: "served-model", status: "ok", ...usage, latencyMs: 250, detail: null,
    });
  });

  it("logs a refusal with its usage and rethrows it", async () => {
    fake.willFail(new AiRefusalError("cyber", usage));
    await expect(metered().generateStructured(request)).rejects.toBeInstanceOf(AiRefusalError);
    expect(calls.calls[0]).toMatchObject({ status: "refused", costUsd: 0.02, model: "fake-model" });
    expect(calls.calls[0]?.detail).toContain("cyber");
  });

  it("logs provider errors; tokens spent before the failure still count", async () => {
    fake.willFail(new AiProviderError("bad json", usage)).willFail(new Error("network down"));
    await expect(metered().generateStructured(request)).rejects.toBeInstanceOf(AiProviderError);
    await expect(metered().generateStructured(request)).rejects.toThrow("network down");

    expect(calls.calls.map((c) => [c.status, c.costUsd])).toEqual([["error", 0.02], ["error", 0]]);
    expect(calls.calls[1]?.detail).toContain("network down");
  });

  it("does not log when the provider is not configured (nothing was sent)", async () => {
    fake.willFail(new AiNotConfiguredError("no key"));
    await expect(metered().generateStructured(request)).rejects.toBeInstanceOf(AiNotConfiguredError);
    expect(calls.calls).toHaveLength(0);
  });
});

describe("MeteredAiProvider budget", () => {
  it("blocks without calling the provider once the daily budget is spent", async () => {
    seed(1);
    await expect(metered(1).generateStructured(request)).rejects.toBeInstanceOf(BudgetExceededError);
    expect(fake.requests).toHaveLength(0);
    expect(calls.calls.at(-1)).toMatchObject({ status: "budget_blocked", costUsd: 0, inputTokens: 0 });
  });

  it("allows calls while spend is below the budget", async () => {
    seed(0.99);
    fake.willReturn({ ok: true }, usage);
    await expect(metered(1).generateStructured(request)).resolves.toBeDefined();
  });

  it("stops after cumulative spend reaches the budget", async () => {
    const provider = metered(1);
    fake.willReturn({ ok: true }, { ...usage, costUsd: 0.6 }).willReturn({ ok: true }, { ...usage, costUsd: 0.6 });
    await provider.generateStructured(request);
    await provider.generateStructured(request);
    await expect(provider.generateStructured(request)).rejects.toBeInstanceOf(BudgetExceededError);
    expect(fake.requests).toHaveLength(2);
  });

  it("counts only the current UTC day", async () => {
    seed(5, new Date("2026-03-09T23:59:59Z"));
    fake.willReturn({ ok: true }, usage);
    await expect(metered(1).generateStructured(request)).resolves.toBeDefined();
  });

  it("resets at midnight UTC", async () => {
    clock = Date.parse("2026-03-10T23:59:59Z");
    seed(1);
    await expect(metered(1).generateStructured(request)).rejects.toBeInstanceOf(BudgetExceededError);
    clock = Date.parse("2026-03-11T00:00:01Z");
    fake.willReturn({ ok: true }, usage);
    await expect(metered(1).generateStructured(request)).resolves.toBeDefined();
  });

  it("a budget of 0 disables AI", async () => {
    await expect(metered(0).generateStructured(request)).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it("blocked attempts do not count as calls or spend", async () => {
    seed(1);
    const provider = metered(1);
    await expect(provider.generateStructured(request)).rejects.toBeInstanceOf(BudgetExceededError);
    await expect(provider.generateStructured(request)).rejects.toBeInstanceOf(BudgetExceededError);
    await expect(calls.totalsSince(new Date("2026-03-10T00:00:00Z"))).resolves.toMatchObject({ calls: 1, spentUsd: 1 });
  });
});
