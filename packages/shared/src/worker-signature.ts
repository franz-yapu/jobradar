import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signature of the calls the queue worker makes to the API (SDD-010). Server-side only: import it from
 * `@jobradar/shared/worker-signature`, never from the package index (the web bundle must not pull node:crypto).
 * The signed text is `<timestamp>.<METHOD>.<path>`; the requests carry no body.
 */
export const WORKER_SIGNATURE_WINDOW_MS = 5 * 60 * 1000;
export const WORKER_TIMESTAMP_HEADER = "x-worker-timestamp";
export const WORKER_SIGNATURE_HEADER = "x-worker-signature";

export interface WorkerSignatureInput {
  secret: string;
  method: string;
  path: string;
}

function mac({ secret, method, path }: WorkerSignatureInput, timestamp: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${method.toUpperCase()}.${path}`).digest("hex");
}

export function signWorkerRequest(input: WorkerSignatureInput, now: number = Date.now()): { timestamp: string; signature: string } {
  const timestamp = String(now);
  return { timestamp, signature: mac(input, timestamp) };
}

/** Constant-time check; also false when the timestamp is malformed or outside the replay window. */
export function verifyWorkerRequest(
  input: WorkerSignatureInput,
  received: { timestamp: string | undefined; signature: string | undefined },
  now: number = Date.now(),
): boolean {
  const { timestamp, signature } = received;
  if (!timestamp || !signature || !/^\d{1,15}$/.test(timestamp)) return false;
  if (Math.abs(now - Number(timestamp)) > WORKER_SIGNATURE_WINDOW_MS) return false;
  const expected = Buffer.from(mac(input, timestamp), "hex");
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
