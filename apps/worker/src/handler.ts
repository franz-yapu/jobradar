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

export interface SecretEnv {
  WORKER_SECRET?: string | undefined;
  WORKER_SECRET_PARAM?: string | undefined;
}

/**
 * The shared secret comes from SSM Parameter Store (SecureString) in AWS, so it is never in the Lambda
 * configuration or in Terraform state. `WORKER_SECRET` is accepted for local runs and tests.
 */
export async function loadSecret(env: SecretEnv, getParameter: (name: string) => Promise<string>): Promise<string> {
  if (env.WORKER_SECRET) return env.WORKER_SECRET;
  if (env.WORKER_SECRET_PARAM) return getParameter(env.WORKER_SECRET_PARAM);
  throw new Error("WORKER_SECRET_PARAM (or WORKER_SECRET) is required");
}

async function ssmGetParameter(name: string): Promise<string> {
  // Provided by the Lambda runtime (kept external in the bundle); imported lazily so tests do not need it.
  const { SSMClient, GetParameterCommand } = await import("@aws-sdk/client-ssm");
  const out = await new SSMClient({}).send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  const value = out.Parameter?.Value;
  if (!value) throw new Error(`SSM parameter ${name} has no value`);
  return value;
}

let cached: ReturnType<typeof createHandler> | undefined;

/** Lambda entry point: configuration comes from the environment; the secret is read once per cold start. */
export const handler = async (event: SqsEvent): Promise<SqsBatchResponse> => {
  if (!cached) {
    const apiUrl = process.env["API_URL"];
    if (!apiUrl) throw new Error("API_URL is required");
    const secret = await loadSecret(process.env, ssmGetParameter);
    cached = createHandler({ apiUrl, secret });
  }
  return cached(event);
};
