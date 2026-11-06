import "reflect-metadata";
import {
  CreateQueueCommand,
  DeleteMessageCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHandler } from "../../worker/src/handler.js";
import { AppModule } from "../src/app.module.js";
import { AI_INNER_PROVIDER } from "../src/ai/infrastructure/ai.module.js";
import { FakeAiProvider } from "../src/ai/infrastructure/fake-ai.provider.js";
import { PrismaService } from "../src/shared/infrastructure/prisma/prisma.service.js";
import { loginAgent, removeTestUsers } from "./helpers/auth.js";

/**
 * End to end through a real SQS API (LocalStack): API -> queue -> worker handler -> API -> score.
 * Opt-in: `docker compose --profile aws up -d localstack`, then `RUN_LOCALSTACK=1 pnpm --filter @jobradar/api exec vitest run test/sqs-localstack`.
 */
const enabled = process.env["RUN_LOCALSTACK"] === "1";
const ENDPOINT = process.env["AWS_ENDPOINT_URL"] ?? `http://localhost:${process.env["LOCALSTACK_PORT"] ?? "4566"}`;
const SECRET = "l".repeat(32);
const suffix = Math.random().toString(36).slice(2, 8);

describe.skipIf(!enabled)("batch scoring through SQS (LocalStack)", () => {
  const sqs = new SQSClient({ region: "us-east-1", endpoint: ENDPOINT, credentials: { accessKeyId: "test", secretAccessKey: "test" } });
  let queueUrl = "";
  let dlqUrl = "";
  let app: INestApplication;
  let apiUrl = "";
  const fake = new FakeAiProvider();

  beforeAll(async () => {
    process.env["AWS_ACCESS_KEY_ID"] = "test";
    process.env["AWS_SECRET_ACCESS_KEY"] = "test";
    process.env["WORKER_SECRET"] = SECRET;
    process.env["AWS_ENDPOINT_URL"] = ENDPOINT;
    process.env["AI_DAILY_BUDGET_USD"] = "5";

    dlqUrl = (await sqs.send(new CreateQueueCommand({ QueueName: `jr-dlq-${suffix}` }))).QueueUrl ?? "";
    const dlqArn = (await sqs.send(new GetQueueAttributesCommand({ QueueUrl: dlqUrl, AttributeNames: ["QueueArn"] }))).Attributes?.["QueueArn"];
    queueUrl =
      (
        await sqs.send(
          new CreateQueueCommand({
            QueueName: `jr-jobs-${suffix}`,
            Attributes: {
              VisibilityTimeout: "1",
              RedrivePolicy: JSON.stringify({ deadLetterTargetArn: dlqArn, maxReceiveCount: 2 }),
            },
          }),
        )
      ).QueueUrl ?? "";
    process.env["SQS_QUEUE_URL"] = queueUrl;

    app = (await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(AI_INNER_PROVIDER).useValue(fake).compile()).createNestApplication();
    await app.init();
    await app.listen(0);
    apiUrl = await app.getUrl();
  });

  afterAll(async () => {
    await removeTestUsers(app);
    await app.close();
    await sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
    await sqs.send(new DeleteQueueCommand({ QueueUrl: dlqUrl }));
    delete process.env["SQS_QUEUE_URL"];
  });

  async function receive(url: string, max = 10) {
    const res = await sqs.send(new ReceiveMessageCommand({ QueueUrl: url, MaxNumberOfMessages: max, WaitTimeSeconds: 2 }));
    return (res.Messages ?? []).flatMap((m) =>
      m.MessageId && m.Body && m.ReceiptHandle ? [{ messageId: m.MessageId, body: m.Body, receipt: m.ReceiptHandle }] : [],
    );
  }

  it("enqueues a batch, the worker drains it through the API, and a redelivery scores nothing twice", async () => {
    const agent = await loginAgent(app);
    await agent.put("/profile").send({
      stack: ["TypeScript"], seniority: "senior", allowedLocations: ["BO"], maxEnglishLevel: "B2", excludedContractTypes: [], summary: "x",
    });
    for (let i = 0; i < 3; i++) {
      await agent.post("/postings").send({ title: `J${i}`, company: "Acme", url: `https://x.test/${suffix}/${i}`, source: "t", remoteScope: "latam", description: "Node" }).expect(201);
      fake.willReturn({ verdict: "fit", reasons: ["ok"], blockers: [] });
    }

    const started = await agent.post("/scoring/batches").send({}).expect(202);
    const records = await receive(queueUrl);
    expect(records).toHaveLength(3);

    const worker = createHandler({ apiUrl, secret: SECRET });
    expect((await worker({ Records: records })).batchItemFailures).toEqual([]);
    expect((await worker({ Records: records })).batchItemFailures).toEqual([]); // redelivery
    // What the Lambda event source does after a successful invocation: delete the processed messages.
    for (const record of records) await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: record.receipt }));

    const progress = await agent.get(`/scoring/batches/${started.body.id as string}`).expect(200);
    expect(progress.body).toMatchObject({ requested: 3, done: 3, failed: 0, queued: 0 });
    expect(fake.requests).toHaveLength(3);
    expect(await app.get(PrismaService).postingScore.count({ where: { postingId: { in: (await agent.get("/postings?pageSize=50")).body.items.map((p: { id: string }) => p.id) } } })).toBe(3);
  });

  it("a message nobody deletes moves to the dead-letter queue once maxReceiveCount is exceeded", async () => {
    await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "poison" }));
    expect(await receive(queueUrl, 1)).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await receive(queueUrl, 1)).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    // Keep receiving until SQS gives up on it and moves it (AWS and LocalStack differ on the exact receive).
    let dead: Awaited<ReturnType<typeof receive>> = [];
    for (let attempt = 0; attempt < 8 && dead.length === 0; attempt++) {
      await receive(queueUrl, 1);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      dead = await receive(dlqUrl, 1);
    }
    expect(dead.map((m) => m.body)).toEqual(["poison"]);
  }, 60_000);
});
