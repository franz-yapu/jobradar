import { describe, expect, it } from "vitest";
import { computeMetrics, parsePromptfooResults, thresholdFailures, type EvalCase } from "./metrics.js";

const c = (over: Partial<EvalCase>): EvalCase => ({
  id: "x", expectedVerdict: "fit", expectedBlockers: [],
  actual: { verdict: "fit", blockerTypes: [] }, costUsd: 0.01, latencyMs: 1000, ...over,
});
const rejectCase = (over: Partial<EvalCase> = {}): EvalCase =>
  c({ expectedVerdict: "reject", expectedBlockers: ["location"], actual: { verdict: "reject", blockerTypes: ["location"] }, ...over });

describe("computeMetrics", () => {
  it("is perfect on a perfect run and sums cost", () => {
    const m = computeMetrics([c({}), rejectCase()]);
    expect(m).toMatchObject({ total: 2, errors: 0, verdictAccuracy: 1, blockerRecall: 1, unsafeFits: 0 });
    expect(m.totalCostUsd).toBeCloseTo(0.02);
  });

  it("counts errored calls as wrong and as missed blockers", () => {
    const m = computeMetrics([c({}), rejectCase({ actual: null })]);
    expect(m).toMatchObject({ errors: 1, verdictAccuracy: 0.5, blockerRecall: 0, unsafeFits: 0 });
  });

  it("detects a blocker only when an acceptable type is reported with a reject", () => {
    const wrongType = rejectCase({ actual: { verdict: "reject", blockerTypes: ["stack"] } });
    const notRejected = rejectCase({ actual: { verdict: "maybe", blockerTypes: ["location"] } });
    expect(computeMetrics([wrongType, notRejected, rejectCase()]).blockerRecall).toBeCloseTo(1 / 3);
  });

  it("counts a fit on a reject-labelled posting as unsafe", () => {
    const m = computeMetrics([rejectCase({ actual: { verdict: "fit", blockerTypes: [] } })]);
    expect(m.unsafeFits).toBe(1);
  });

  it("reports mean and p95 latency", () => {
    const cases = Array.from({ length: 20 }, (_, i) => c({ latencyMs: (i + 1) * 100 }));
    const m = computeMetrics(cases);
    expect(m.meanLatencyMs).toBe(1050);
    expect(m.p95LatencyMs).toBe(1900);
  });
});

describe("thresholdFailures", () => {
  it("passes at the thresholds and fails below them", () => {
    const ok = computeMetrics([...Array.from({ length: 17 }, () => c({})), ...Array.from({ length: 3 }, () => c({ actual: { verdict: "maybe", blockerTypes: [] } }))]);
    expect(ok.verdictAccuracy).toBe(0.85);
    expect(thresholdFailures(ok)).toEqual([]);

    const bad = computeMetrics([c({}), c({ actual: { verdict: "maybe", blockerTypes: [] } }), rejectCase({ actual: { verdict: "fit", blockerTypes: [] } })]);
    expect(thresholdFailures(bad)).toHaveLength(3);
  });

  it("fails when nothing was evaluated", () => {
    expect(thresholdFailures(computeMetrics([]))).toEqual(["no cases were evaluated"]);
  });
});

describe("parsePromptfooResults", () => {
  const row = (output: unknown, extra: object = {}) => ({
    cost: 0.02, latencyMs: 900, response: { output },
    testCase: { description: "case-a", metadata: { expectedVerdict: "reject", expectedBlockers: ["english"] } }, ...extra,
  });

  it("maps promptfoo rows, parsing the JSON output string", () => {
    const [parsed] = parsePromptfooResults({
      results: { results: [row(JSON.stringify({ verdict: "reject", blockers: [{ type: "english", evidence: "C2" }] }))] },
    });
    expect(parsed).toEqual({
      id: "case-a", expectedVerdict: "reject", expectedBlockers: ["english"],
      actual: { verdict: "reject", blockerTypes: ["english"] }, costUsd: 0.02, latencyMs: 900,
    });
  });

  it("treats failed or malformed outputs as errors", () => {
    const cases = parsePromptfooResults({ results: { results: [row(undefined), row("not json"), row('{"verdict":"great"}')] } });
    expect(cases.map((x) => x.actual)).toEqual([null, null, null]);
  });

  it("rejects reports without labels or results", () => {
    expect(() => parsePromptfooResults({})).toThrow(/results.results/);
    expect(() => parsePromptfooResults({ results: { results: [{ response: {}, testCase: {} }] } })).toThrow(/expectedVerdict/);
  });
});
