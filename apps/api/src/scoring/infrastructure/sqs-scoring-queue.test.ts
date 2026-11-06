import type { SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import { describe, expect, it } from "vitest";
import { SqsScoringQueue } from "./sqs-scoring-queue.js";

const jobs = (n: number) => Array.from({ length: n }, (_, i) => ({ jobId: `job-${i}`, userId: "u", postingId: `p-${i}` }));

function fakeClient(failed: { Id: string }[] = []) {
  const sent: SendMessageBatchCommand[] = [];
  return {
    sent,
    client: {
      send: async (command: SendMessageBatchCommand) => {
        sent.push(command);
        return { Failed: failed };
      },
    } as never,
  };
}

describe("SqsScoringQueue", () => {
  it("sends one message per job with the job as JSON body", async () => {
    const { client, sent } = fakeClient();
    await new SqsScoringQueue(client, "http://q/1/jobs").enqueue(jobs(2));
    expect(sent).toHaveLength(1);
    const input = sent[0]?.input;
    expect(input?.QueueUrl).toBe("http://q/1/jobs");
    expect(input?.Entries?.map((e) => e.Id)).toEqual(["job-0", "job-1"]);
    expect(JSON.parse(input?.Entries?.[0]?.MessageBody ?? "")).toEqual({ jobId: "job-0", userId: "u", postingId: "p-0" });
  });

  it("splits more than 10 jobs into SQS-sized batches", async () => {
    const { client, sent } = fakeClient();
    await new SqsScoringQueue(client, "q").enqueue(jobs(23));
    expect(sent.map((c) => c.input.Entries?.length)).toEqual([10, 10, 3]);
  });

  it("sends nothing for no jobs", async () => {
    const { client, sent } = fakeClient();
    await new SqsScoringQueue(client, "q").enqueue([]);
    expect(sent).toHaveLength(0);
  });

  it("throws when SQS rejects entries, naming them", async () => {
    const { client } = fakeClient([{ Id: "job-1" }]);
    await expect(new SqsScoringQueue(client, "q").enqueue(jobs(2))).rejects.toThrow(/job-1/);
  });
});
