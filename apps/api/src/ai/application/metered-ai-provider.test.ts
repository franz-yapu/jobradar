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

const USER = "user-a";
const request: GenerateStructuredRequest<{ ok: boolean }> = {
  userId: USER,
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

function metered(budget = 1, globalBudget?: number): MeteredAiProvider {
  return new MeteredAiProvider(slow(fake), calls, {
    dailyBudgetUsd: budget,
    ...(globalBudget !== undefined && { globalDailyBudgetUsd: globalBudget }),
    now,
  });
}

function seed(costUsd: number, createdAt = new Date(clock), status: AiCall["status"] = "ok", userId = USER): void {
  calls.calls.push({
    id: crypto.randomUUID(), userId, purpose: "scoring", model: "m", status, inputTokens: 1, outputTokens: 1,
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
    await expect(calls.totalsSince(USER, new Date("2026-03-10T00:00:00Z"))).resolves.toMatchObject({ calls: 1, spentUsd: 1 });
  });

  it("keeps the budget per account: one account spending it all does not block another", async () => {
    seed(1); // user-a is at its limit
    await expect(metered(1).generateStructured(request)).rejects.toBeInstanceOf(BudgetExceededError);

    fake.willReturn({ ok: true }, usage);
    await expect(metered(1).generateStructured({ ...request, userId: "user-b" })).resolves.toBeDefined();
  });

  it("logs every call under the account that made it", async () => {
    fake.willReturn({ ok: true }, usage).willReturn({ ok: true }, usage);
    await metered(1).generateStructured(request);
    await metered(1).generateStructured({ ...request, userId: "user-b" });
    expect(calls.calls.map((c) => c.userId)).toEqual([USER, "user-b"]);
  });

  it("logs a budget block under the account that was blocked", async () => {
    seed(1);
    await expect(metered(1).generateStructured(request)).rejects.toBeInstanceOf(BudgetExceededError);
    expect(calls.calls.at(-1)).toMatchObject({ status: "budget_blocked", userId: USER });
  });
});

describe("MeteredAiProvider global budget (open registration)", () => {
  const OTHER = "user-b";

  it("blocks an account that is under its own cap once ALL accounts together spent the global cap", async () => {
    seed(0.6, new Date(clock), "ok", OTHER);
    seed(0.5, new Date(clock), "ok", "user-c");
    await expect(metered(5, 1).generateStructured(request)).rejects.toBeInstanceOf(BudgetExceededError);
    expect(fake.requests).toHaveLength(0);
    expect(calls.calls.at(-1)).toMatchObject({ status: "budget_blocked", userId: USER, costUsd: 0 });
    expect(calls.calls.at(-1)?.detail).toMatch(/global/i);
  });

  it("allows the call while the global total is below the cap", async () => {
    seed(0.5, new Date(clock), "ok", OTHER);
    fake.willReturn({ ok: true }, usage);
    expect((await metered(5, 1).generateStructured(request)).data).toEqual({ ok: true });
  });

  it("reports the account cap, not the global one, when the account itself is over", async () => {
    seed(2, new Date(clock), "ok", USER);
    await expect(metered(1, 100).generateStructured(request)).rejects.toBeInstanceOf(BudgetExceededError);
    expect(calls.calls.at(-1)?.detail).not.toMatch(/global/i);
  });

  it("ignores other accounts' spend when no global cap is configured", async () => {
    seed(50, new Date(clock), "ok", OTHER);
    fake.willReturn({ ok: true }, usage);
    expect((await metered(1).generateStructured(request)).data).toEqual({ ok: true });
  });

  it("starts a new global window at 00:00 UTC and does not count budget-blocked attempts", async () => {
    seed(5, new Date(Date.parse("2026-03-09T23:59:00Z")), "ok", OTHER);
    seed(5, new Date(clock), "budget_blocked", OTHER);
    fake.willReturn({ ok: true }, usage);
    expect((await metered(5, 1).generateStructured(request)).data).toEqual({ ok: true });
  });

  it("a global cap of 0 disables AI for everybody", async () => {
    await expect(metered(5, 0).generateStructured(request)).rejects.toBeInstanceOf(BudgetExceededError);
    expect(fake.requests).toHaveLength(0);
  });
});
