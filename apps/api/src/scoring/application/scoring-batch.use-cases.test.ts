import { beforeEach, describe, expect, it } from "vitest";
import { BudgetExceededError } from "../../ai/domain/ai-provider.js";
import { FakeAiProvider } from "../../ai/infrastructure/fake-ai.provider.js";
import { createPosting } from "../../postings/domain/posting.js";
import { InMemoryPostingRepository } from "../../postings/infrastructure/in-memory-posting.repository.js";
import { ProfileNotFoundError } from "../../profile/domain/profile.repository.js";
import { InMemoryProfileRepository } from "../../profile/infrastructure/in-memory-profile.repository.js";
import type { ScoringJobMessage } from "../domain/scoring-batch.js";
import { ScoringBatchNotFoundError, ScoringJobNotFoundError } from "../domain/scoring-batch.repository.js";
import type { ScoringQueue } from "../domain/scoring-queue.js";
import { InMemoryPostingScoreRepository } from "../infrastructure/in-memory-posting-score.repository.js";
import { InMemoryScoringBatchRepository } from "../infrastructure/in-memory-scoring-batch.repository.js";
import { InProcessScoringQueue } from "../infrastructure/in-process-scoring-queue.js";
import { GetScoringBatch } from "./get-scoring-batch.use-case.js";
import { ProcessScoringJob } from "./process-scoring-job.use-case.js";
import { ScorePosting } from "./score-posting.use-case.js";
import { StartScoringBatch } from "./start-scoring-batch.use-case.js";

const A = "user-a";
const B = "user-b";
const NOW = new Date("2026-01-01T00:00:00Z");

class RecordingQueue implements ScoringQueue {
  readonly sent: ScoringJobMessage[] = [];
  async enqueue(jobs: readonly ScoringJobMessage[]): Promise<void> {
    this.sent.push(...jobs);
  }
}

let postings: InMemoryPostingRepository;
let profiles: InMemoryProfileRepository;
let batches: InMemoryScoringBatchRepository;
let ai: FakeAiProvider;
let queue: RecordingQueue;
let start: StartScoringBatch;
let process: ProcessScoringJob;
let get: GetScoringBatch;

async function addPostings(userId: string | null, count: number, offset = 0): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const posting = createPosting(
      userId,
      { title: `Job ${offset + i}`, company: "Acme", url: `https://x.test/${userId}/${offset + i}`, source: "t", remoteScope: "latam", description: "Node" },
      new Date(NOW.getTime() + (offset + i) * 1000),
    );
    await postings.save(posting);
    ids.push(posting.id);
  }
  return ids;
}

/** The id of a started batch; fails the test when nothing was queued. */
function batchId(started: { id: string | null }): string {
  if (started.id === null) throw new Error("expected a batch to be started");
  return started.id;
}

function sentJobId(index: number): string {
  const message = queue.sent[index];
  if (!message) throw new Error(`no job was queued at ${index}`);
  return message.jobId;
}

const saveProfile = (userId: string) =>
  profiles.save(userId, {
    stack: ["TypeScript"], seniority: "senior", allowedLocations: ["BO"], maxEnglishLevel: "B2",
    excludedContractTypes: [], summary: "", education: [], experience: [], languages: [], certifications: [],
  });

beforeEach(() => {
  postings = new InMemoryPostingRepository();
  profiles = new InMemoryProfileRepository(() => NOW);
  batches = new InMemoryScoringBatchRepository();
  ai = new FakeAiProvider();
  queue = new RecordingQueue();
  const score = new ScorePosting(postings, profiles, new InMemoryPostingScoreRepository(), ai, () => NOW);
  start = new StartScoringBatch(postings, profiles, batches, queue, () => NOW);
  process = new ProcessScoringJob(batches, score, () => NOW);
  get = new GetScoringBatch(batches);
});

describe("StartScoringBatch", () => {
  it("fails without a profile and queues nothing", async () => {
    await addPostings(A, 2);
    await expect(start.execute(A, 10)).rejects.toBeInstanceOf(ProfileNotFoundError);
    expect(queue.sent).toHaveLength(0);
  });

  it("returns requested 0 and no batch when nothing is unscored", async () => {
    await saveProfile(A);
    expect(await start.execute(A, 10)).toEqual({ id: null, requested: 0 });
    expect(queue.sent).toHaveLength(0);
  });

  it("queues the newest unscored postings (own + catalog) up to the limit", async () => {
    await saveProfile(A);
    const own = await addPostings(A, 2, 0);
    const catalog = await addPostings(null, 2, 2);
    await addPostings(B, 3, 10); // another account's private postings are never taken
    const started = await start.execute(A, 3);
    const { requested } = started;
    expect(requested).toBe(3);
    const progress = await get.execute(A, batchId(started));
    expect(progress.jobs.map((j) => j.postingId).sort()).toEqual([own[1] ?? "", catalog[0] ?? "", catalog[1] ?? ""].sort());
    expect(progress.jobs.every((j) => j.status === "queued")).toBe(true);
    expect(queue.sent.map((m) => m.jobId).sort()).toEqual(progress.jobs.map((j) => j.id).sort());
    expect(queue.sent.every((m) => m.userId === A)).toBe(true);
  });

  it("skips postings the account already scored", async () => {
    await saveProfile(A);
    const ids = await addPostings(A, 2);
    postings.attachScore(ids[0] ?? "", { verdict: "fit", reasons: [], blockers: [], scoredAt: NOW });
    const started = await start.execute(A, 10);
    expect((await get.execute(A, batchId(started))).jobs).toHaveLength(1);
  });
});

describe("GetScoringBatch", () => {
  it("answers not found for another account's batch", async () => {
    await saveProfile(A);
    await addPostings(A, 1);
    const started = await start.execute(A, 10);
    await expect(get.execute(B, batchId(started))).rejects.toBeInstanceOf(ScoringBatchNotFoundError);
  });
});

describe("ProcessScoringJob", () => {
  it("scores the posting and marks the job done", async () => {
    await saveProfile(A);
    await addPostings(A, 1);
    const started = await start.execute(A, 10);
    ai.willReturn({ verdict: "fit", reasons: ["ok"], blockers: [] });
    await process.execute(sentJobId(0));
    expect((await get.execute(A, batchId(started))).jobs[0]).toMatchObject({ status: "done", errorCode: null });
    expect(ai.requests).toHaveLength(1);
  });

  it("is idempotent: a redelivered message scores nothing twice", async () => {
    await saveProfile(A);
    await addPostings(A, 1);
    await start.execute(A, 10);
    ai.willReturn({ verdict: "fit", reasons: [], blockers: [] });
    await process.execute(sentJobId(0));
    await process.execute(sentJobId(0));
    expect(ai.requests).toHaveLength(1);
  });

  it("throws for an unknown job", async () => {
    await expect(process.execute("00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(ScoringJobNotFoundError);
  });

  it("records a provider failure on the job and leaves the other jobs to run", async () => {
    await saveProfile(A);
    await addPostings(A, 2);
    const started = await start.execute(A, 10);
    ai.willFail(new Error("boom"));
    ai.willReturn({ verdict: "maybe", reasons: [], blockers: [] });
    for (const m of queue.sent) await process.execute(m.jobId);
    const { jobs } = await get.execute(A, batchId(started));
    expect(jobs.map((j) => j.status).sort()).toEqual(["done", "failed"]);
    expect(jobs.find((j) => j.status === "failed")?.errorCode).toBe("internal_error");
  });

  it("a budget stop fails the rest of the batch without more AI calls", async () => {
    await saveProfile(A);
    await addPostings(A, 3);
    const started = await start.execute(A, 10);
    ai.willFail(new BudgetExceededError(1, 1));
    for (const m of queue.sent) await process.execute(m.jobId);
    const { jobs } = await get.execute(A, batchId(started));
    expect(jobs.every((j) => j.status === "failed" && j.errorCode === "ai_budget_exceeded")).toBe(true);
    expect(ai.requests).toHaveLength(1);
  });
});

describe("InProcessScoringQueue", () => {
  it("runs the jobs one at a time after enqueue returns, and survives a crashing job", async () => {
    const order: string[] = [];
    const queue = new InProcessScoringQueue(async (jobId) => {
      order.push(`start-${jobId}`);
      await Promise.resolve();
      if (jobId === "1") throw new Error("crash");
      order.push(`end-${jobId}`);
    });
    await queue.enqueue([1, 2].map((n) => ({ jobId: String(n), userId: A, postingId: "p" })));
    expect(order).not.toContain("end-2"); // enqueue did not wait for the work
    await queue.idle();
    expect(order).toEqual(["start-1", "start-2", "end-2"]);
  });
});
