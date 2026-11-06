import { describe, expect, it } from "vitest";
import { signWorkerRequest, verifyWorkerRequest, WORKER_SIGNATURE_WINDOW_MS } from "./worker-signature.js";

const input = { secret: "s".repeat(32), method: "POST", path: "/internal/scoring/jobs/abc/process" };
const NOW = 1_800_000_000_000;

describe("worker signature", () => {
  it("accepts a fresh, correct signature", () => {
    expect(verifyWorkerRequest(input, signWorkerRequest(input, NOW), NOW)).toBe(true);
  });
  it("rejects another secret, method or path", () => {
    const signed = signWorkerRequest(input, NOW);
    expect(verifyWorkerRequest({ ...input, secret: "x".repeat(32) }, signed, NOW)).toBe(false);
    expect(verifyWorkerRequest({ ...input, method: "GET" }, signed, NOW)).toBe(false);
    expect(verifyWorkerRequest({ ...input, path: "/internal/scoring/jobs/other/process" }, signed, NOW)).toBe(false);
  });
  it("rejects a stale or future timestamp (replay window)", () => {
    const signed = signWorkerRequest(input, NOW);
    expect(verifyWorkerRequest(input, signed, NOW + WORKER_SIGNATURE_WINDOW_MS)).toBe(true);
    expect(verifyWorkerRequest(input, signed, NOW + WORKER_SIGNATURE_WINDOW_MS + 1)).toBe(false);
    expect(verifyWorkerRequest(input, signed, NOW - WORKER_SIGNATURE_WINDOW_MS - 1)).toBe(false);
  });
  it("rejects missing, malformed or truncated values without throwing", () => {
    const signed = signWorkerRequest(input, NOW);
    expect(verifyWorkerRequest(input, { timestamp: undefined, signature: signed.signature }, NOW)).toBe(false);
    expect(verifyWorkerRequest(input, { timestamp: signed.timestamp, signature: undefined }, NOW)).toBe(false);
    expect(verifyWorkerRequest(input, { timestamp: "abc", signature: signed.signature }, NOW)).toBe(false);
    expect(verifyWorkerRequest(input, { timestamp: signed.timestamp, signature: "zz" }, NOW)).toBe(false);
    expect(verifyWorkerRequest(input, { timestamp: signed.timestamp, signature: signed.signature.slice(2) }, NOW)).toBe(false);
  });
});
