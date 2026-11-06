import { signWorkerRequest, WORKER_SIGNATURE_HEADER, WORKER_TIMESTAMP_HEADER } from "@jobradar/shared/worker-signature";

/** The slice of an SQS event this worker reads (no @types/aws-lambda needed). */
export interface SqsEvent {
  Records: { messageId: string; body: string }[];
}
export interface SqsBatchResponse {
  batchItemFailures: { itemIdentifier: string }[];
}

export interface WorkerDeps {
  apiUrl: string;
  secret: string;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseJobId(body: string): string | null {
  try {
    const { jobId } = JSON.parse(body) as { jobId?: unknown };
    return typeof jobId === "string" && UUID.test(jobId) ? jobId : null;
  } catch {
    return null;
  }
}

export function createHandler(deps: WorkerDeps): (event: SqsEvent) => Promise<SqsBatchResponse> {
  const send = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const base = deps.apiUrl.replace(/\/+$/, "");

  async function processRecord(body: string): Promise<boolean> {
    const jobId = parseJobId(body);
    if (jobId === null) return false;
    const path = `/internal/scoring/jobs/${jobId}/process`;
    const { timestamp, signature } = signWorkerRequest({ secret: deps.secret, method: "POST", path }, now());
    const res = await send(`${base}${path}`, {
      method: "POST",
      headers: { [WORKER_TIMESTAMP_HEADER]: timestamp, [WORKER_SIGNATURE_HEADER]: signature },
      signal: AbortSignal.timeout(deps.timeoutMs ?? 60_000),
    });
    // 404: the job (or its account) was deleted; retrying can never succeed.
    return res.ok || res.status === 404;
  }

  return async (event) => {
    const batchItemFailures: { itemIdentifier: string }[] = [];
    for (const record of event.Records) {
      const ok = await processRecord(record.body).catch(() => false); // network error or timeout: let SQS redeliver
      if (!ok) batchItemFailures.push({ itemIdentifier: record.messageId });
    }
    return { batchItemFailures };
  };
}

/** Lambda entry point: configuration comes from the environment, validated on cold start. */
export const handler = (event: SqsEvent): Promise<SqsBatchResponse> => {
  const apiUrl = process.env["API_URL"];
  const secret = process.env["WORKER_SECRET"];
  if (!apiUrl || !secret) throw new Error("API_URL and WORKER_SECRET are required");
  return createHandler({ apiUrl, secret })(event);
};
