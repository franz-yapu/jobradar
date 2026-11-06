import { verifyWorkerRequest } from "@jobradar/shared/worker-signature";
import { describe, expect, it } from "vitest";
import { createHandler } from "./handler.js";

const SECRET = "s".repeat(32);
const JOB = "11111111-1111-4111-8111-111111111111";
const body = (jobId: string) => JSON.stringify({ jobId, userId: "u", postingId: "p" });

function fakeFetch(statuses: (number | Error)[]) {
  const calls: { url: string; headers: Record<string, string>; method: string }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, method: init.method ?? "" });
    const next = statuses.shift() ?? 204;
    if (next instanceof Error) throw next;
    return new Response(null, { status: next });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("worker handler", () => {
  it("calls the internal endpoint with a valid signature", async () => {
    const { fn, calls } = fakeFetch([204]);
    const now = 1_800_000_000_000;
    const result = await createHandler({ apiUrl: "https://api.example/", secret: SECRET, fetch: fn, now: () => now })({
      Records: [{ messageId: "m1", body: body(JOB) }],
    });
    expect(result.batchItemFailures).toEqual([]);
    const [call] = calls;
    expect(call?.url).toBe(`https://api.example/internal/scoring/jobs/${JOB}/process`);
    expect(call?.method).toBe("POST");
    expect(
      verifyWorkerRequest(
        { secret: SECRET, method: "POST", path: `/internal/scoring/jobs/${JOB}/process` },
        { timestamp: call?.headers["x-worker-timestamp"], signature: call?.headers["x-worker-signature"] },
        now,
      ),
    ).toBe(true);
  });

  it("reports only the failed messages (server error, network error, poison body) and drops a 404", async () => {
    const { fn } = fakeFetch([500, new Error("down"), 404, 204]);
    const result = await createHandler({ apiUrl: "https://api.example", secret: SECRET, fetch: fn })({
      Records: [
        { messageId: "m500", body: body(JOB) },
        { messageId: "mnet", body: body(JOB) },
        { messageId: "m404", body: body(JOB) },
        { messageId: "mpoison", body: "not json" },
        { messageId: "mbadid", body: body("../../etc") },
        { messageId: "mok", body: body(JOB) },
      ],
    });
    expect(result.batchItemFailures.map((f) => f.itemIdentifier)).toEqual(["m500", "mnet", "mpoison", "mbadid"]);
  });
});
