/** Reads the promptfoo JSON report, prints the metrics and exits 1 if a threshold fails. */
import { readFileSync } from "node:fs";
import { THRESHOLDS, computeMetrics, parsePromptfooResults, pct, thresholdFailures } from "./metrics.js";

const file = process.argv[2] ?? "evals/results/latest.json";
const cases = parsePromptfooResults(JSON.parse(readFileSync(file, "utf8")) as unknown);
const m = computeMetrics(cases);

console.log(`\nEval report (${file})`);
console.log(`  cases:               ${m.total} (${m.errors} errored)`);
console.log(`  verdict accuracy:    ${pct(m.verdictAccuracy)}   (threshold >= ${pct(THRESHOLDS.verdictAccuracy)})`);
console.log(`  hard-blocker recall: ${pct(m.blockerRecall)}   (threshold >= ${pct(THRESHOLDS.blockerRecall)}, ${m.blockerCases} cases)`);
console.log(`  unsafe fits:         ${m.unsafeFits}   (threshold ${THRESHOLDS.unsafeFits})`);
console.log(`  cost:                ${m.totalCostUsd.toFixed(4)} USD total, ${(m.total ? m.totalCostUsd / m.total : 0).toFixed(5)} per posting`);
console.log(`  latency:             mean ${Math.round(m.meanLatencyMs)} ms, p95 ${Math.round(m.p95LatencyMs)} ms`);

const wrong = cases.filter((c) => c.actual?.verdict !== c.expectedVerdict);
if (wrong.length > 0) {
  console.log("\nMismatches:");
  for (const c of wrong) {
    console.log(`  - ${c.id}: expected ${c.expectedVerdict}, got ${c.actual?.verdict ?? "ERROR"}`);
  }
}

const failures = thresholdFailures(m);
if (failures.length > 0) {
  console.error(`\nFAILED:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("\nPASSED: all thresholds met.");
