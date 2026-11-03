/** Pure metric computation for the scoring evals (SDD-002 T4). No I/O: see check.ts for the CLI. */

export type Verdict = "fit" | "maybe" | "reject";

export interface EvalCase {
  id: string;
  expectedVerdict: Verdict;
  /** Acceptable blocker types: a reject case is detected if at least one of them is reported. */
  expectedBlockers: string[];
  /** null when the call failed (counts as a miss). */
  actual: { verdict: Verdict; blockerTypes: string[] } | null;
  costUsd: number;
  latencyMs: number;
}

export interface EvalMetrics {
  total: number;
  errors: number;
  /** Share of cases whose verdict equals the label (errors count as wrong). */
  verdictAccuracy: number;
  /** Among cases labelled with blockers: share rejected with at least one acceptable blocker type. */
  blockerRecall: number;
  blockerCases: number;
  /** Cases labelled `reject` that the model answered `fit` (must be 0). */
  unsafeFits: number;
  totalCostUsd: number;
  meanLatencyMs: number;
  p95LatencyMs: number;
}

export const THRESHOLDS = { verdictAccuracy: 0.85, blockerRecall: 0.9, unsafeFits: 0 } as const;

function ratio(part: number, whole: number): number {
  return whole === 0 ? 1 : part / whole;
}

export function computeMetrics(cases: readonly EvalCase[]): EvalMetrics {
  const blockerCases = cases.filter((c) => c.expectedBlockers.length > 0);
  const detected = blockerCases.filter(
    (c) => c.actual?.verdict === "reject" && c.actual.blockerTypes.some((t) => c.expectedBlockers.includes(t)),
  );
  const latencies = cases.map((c) => c.latencyMs).sort((a, b) => a - b);
  const p95Index = Math.max(0, Math.ceil(latencies.length * 0.95) - 1);

  return {
    total: cases.length,
    errors: cases.filter((c) => c.actual === null).length,
    verdictAccuracy: ratio(cases.filter((c) => c.actual?.verdict === c.expectedVerdict).length, cases.length),
    blockerRecall: ratio(detected.length, blockerCases.length),
    blockerCases: blockerCases.length,
    unsafeFits: cases.filter((c) => c.expectedVerdict === "reject" && c.actual?.verdict === "fit").length,
    totalCostUsd: cases.reduce((sum, c) => sum + c.costUsd, 0),
    meanLatencyMs: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
    p95LatencyMs: latencies[p95Index] ?? 0,
  };
}

/** Human-readable threshold violations; empty when the eval passes. */
export function thresholdFailures(m: EvalMetrics): string[] {
  const failures: string[] = [];
  if (m.total === 0) failures.push("no cases were evaluated");
  if (m.verdictAccuracy < THRESHOLDS.verdictAccuracy) {
    failures.push(`verdict accuracy ${pct(m.verdictAccuracy)} < ${pct(THRESHOLDS.verdictAccuracy)}`);
  }
  if (m.blockerRecall < THRESHOLDS.blockerRecall) {
    failures.push(`hard-blocker recall ${pct(m.blockerRecall)} < ${pct(THRESHOLDS.blockerRecall)}`);
  }
  if (m.unsafeFits > THRESHOLDS.unsafeFits) {
    failures.push(`${m.unsafeFits} posting(s) labelled reject were answered fit (must be 0)`);
  }
  return failures;
}

export function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

const VERDICTS: readonly string[] = ["fit", "maybe", "reject"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Reads the JSON written by `promptfoo eval -o file.json` into eval cases. Tolerant of failed rows. */
export function parsePromptfooResults(report: unknown): EvalCase[] {
  const rows = isRecord(report) && isRecord(report["results"]) ? report["results"]["results"] : undefined;
  if (!Array.isArray(rows)) throw new Error("Unexpected promptfoo output: results.results is missing");

  return rows.map((row: unknown, index): EvalCase => {
    if (!isRecord(row)) throw new Error(`Unexpected promptfoo row #${index}`);
    const testCase = isRecord(row["testCase"]) ? row["testCase"] : {};
    const meta = isRecord(testCase["metadata"]) ? testCase["metadata"] : {};
    const expectedVerdict = meta["expectedVerdict"];
    if (typeof expectedVerdict !== "string" || !VERDICTS.includes(expectedVerdict)) {
      throw new Error(`Case #${index} has no valid expectedVerdict label`);
    }
    const expectedBlockers = Array.isArray(meta["expectedBlockers"])
      ? meta["expectedBlockers"].filter((b): b is string => typeof b === "string")
      : [];
    const response = isRecord(row["response"]) ? row["response"] : {};
    return {
      id: typeof testCase["description"] === "string" ? testCase["description"] : `case-${index}`,
      expectedVerdict: expectedVerdict as Verdict,
      expectedBlockers,
      actual: parseOutput(response["output"]),
      costUsd: typeof row["cost"] === "number" ? row["cost"] : 0,
      latencyMs: typeof row["latencyMs"] === "number" ? row["latencyMs"] : 0,
    };
  });
}

function parseOutput(output: unknown): EvalCase["actual"] {
  let value = output;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!isRecord(value)) return null;
  const verdict = value["verdict"];
  if (typeof verdict !== "string" || !VERDICTS.includes(verdict)) return null;
  const blockers = Array.isArray(value["blockers"]) ? value["blockers"] : [];
  const blockerTypes = blockers.flatMap((b: unknown) => (isRecord(b) && typeof b["type"] === "string" ? [b["type"]] : []));
  return { verdict: verdict as Verdict, blockerTypes };
}
