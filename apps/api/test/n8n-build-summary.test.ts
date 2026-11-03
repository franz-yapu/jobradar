import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

interface Item {
  title: string;
  company: string;
  url: string;
  latestScore: { verdict: "fit" | "maybe" | "reject"; reasons: string[] } | null;
}
interface Summary {
  buildSummary(items: Item[], options: { now: Date; windowHours: number; total?: number }): string;
  countByVerdict(items: Item[]): Record<string, number>;
  MAX_FITS: number;
  MAX_MESSAGE: number;
}

const root = new URL("../../../n8n/", import.meta.url);
const { buildSummary, countByVerdict, MAX_FITS, MAX_MESSAGE } = createRequire(import.meta.url)(
  new URL("code/build-summary.js", root).pathname,
) as Summary;

const now = new Date("2026-11-03T12:00:00Z"); // 08:00 in La Paz
const opts = { now, windowHours: 24 };
const item = (n: number, verdict: "fit" | "maybe" | "reject" | null, reason = `Reason ${n}`): Item => ({
  title: `Job ${n}`,
  company: `Company ${n}`,
  url: `https://example.com/jobs/${n}`,
  latestScore: verdict ? { verdict, reasons: reason ? [reason] : [] } : null,
});

describe("buildSummary", () => {
  it("says so when there is nothing new", () => {
    expect(buildSummary([], opts)).toBe("JobRadar · resumen del 03/11\nSin ofertas nuevas en las últimas 24 h.");
  });

  it("counts per verdict, lists fits with company, first reason and link, and mentions maybes and unscored", () => {
    const text = buildSummary([item(1, "fit"), item(2, "reject"), item(3, "maybe"), item(4, null), item(5, "fit", "")], opts);
    expect(text).toContain("Ofertas nuevas: 5");
    expect(text).toContain("✅ 2 · ⚠️ 1 · ❌ 1 · ⏳ sin evaluar 1");
    expect(text).toContain("1. Job 1 — Company 1\n   Reason 1\n   https://example.com/jobs/1");
    expect(text).toContain("2. Job 5 — Company 5\n   https://example.com/jobs/5"); // no reason line
    expect(text).not.toContain("Job 2 —"); // rejects and maybes are only counted
    expect(text).toContain("⚠️ 1 para revisar a mano.");
    expect(text).toContain("⏳ 1 sin evaluar");
  });

  it("omits the fits section and the notes when there is nothing to say", () => {
    const text = buildSummary([item(1, "reject"), item(2, "reject")], opts);
    expect(text).toContain("✅ 0 · ⚠️ 0 · ❌ 2 · ⏳ sin evaluar 0");
    expect(text).not.toContain("Para revisar ahora");
    expect(text).not.toContain("a mano");
    expect(text).not.toContain("sin evaluar (");
  });

  it(`lists at most ${MAX_FITS} fits and says how many were left out`, () => {
    const items = Array.from({ length: 14 }, (_, i) => item(i + 1, "fit"));
    const text = buildSummary(items, opts);
    expect(text).toContain("✅ 14");
    expect(text).toContain(`${MAX_FITS}. Job ${MAX_FITS}`);
    expect(text).not.toContain(`Job ${MAX_FITS + 1} —`);
    expect(text).toContain("… y 4 ✅ más");
  });

  it("never exceeds Telegram's limit, even with huge titles and reasons", () => {
    const big = Array.from({ length: 10 }, (_, i) => ({
      ...item(i + 1, "fit", "x ".repeat(500)),
      title: "T".repeat(900),
      company: "C".repeat(900),
      url: `https://example.com/${"u".repeat(700)}`, // links are never shortened
    }));
    const text = buildSummary(big, opts);
    expect(text.length).toBeLessThanOrEqual(MAX_MESSAGE);
    expect(text).toContain("… y ");
  });

  it("flags when the API reports more postings than were fetched", () => {
    const text = buildSummary([item(1, "fit")], { ...opts, total: 250 });
    expect(text).toContain("Ofertas nuevas: 250 (resumen de las 1 más recientes)");
  });

  it("collapses whitespace and shortens long reasons", () => {
    const text = buildSummary([item(1, "fit", `  multi\n line   reason ${"z".repeat(300)}`)], opts);
    const reasonLine = text.split("\n").find((l) => l.startsWith("   multi")) ?? "";
    expect(reasonLine.startsWith("   multi line reason z")).toBe(true);
    expect(reasonLine.length).toBeLessThanOrEqual(3 + 160);
    expect(reasonLine.endsWith("…")).toBe(true);
  });

  it("uses the La Paz calendar day, not UTC", () => {
    expect(buildSummary([], { now: new Date("2026-11-04T02:00:00Z"), windowHours: 24 })).toContain("resumen del 03/11");
  });
});

describe("countByVerdict", () => {
  it("treats a missing score as unscored", () => {
    expect(countByVerdict([item(1, "fit"), item(2, null), item(3, null)])).toEqual({ fit: 1, maybe: 0, reject: 0, unscored: 2 });
  });
});
