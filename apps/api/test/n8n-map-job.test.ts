import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { CreatePostingSchema } from "@jobradar/shared";
import { describe, expect, it } from "vitest";

interface Job {
  id?: string;
  attributes?: Record<string, unknown>;
  links?: { public_url?: string };
}
interface Posting {
  title: string;
  company: string;
  url: string;
  source: string;
  remoteScope: string;
  description: string;
  location?: string;
  publishedAt?: string;
}
interface Mapper {
  htmlToText(html: unknown): string;
  mapJob(job: unknown): Posting | null;
  publishedWithin(job: unknown, hours: number, nowMs: number): boolean;
  MAX_DESCRIPTION: number;
}

const root = new URL("../../../n8n/", import.meta.url);
const { htmlToText, mapJob, publishedWithin, MAX_DESCRIPTION } = createRequire(import.meta.url)(
  new URL("code/map-job.js", root).pathname,
) as Mapper;
const fixture = JSON.parse(readFileSync(new URL("fixtures/getonboard-jobs.json", root), "utf8")) as { data: Job[] };

const base = (attributes: Record<string, unknown> = {}, publicUrl = "https://www.getonbrd.com/jobs/x"): Job => ({
  id: "x",
  attributes: { title: "Backend Dev", remote_modality: "fully_remote", countries: ["Remote"], ...attributes },
  links: { public_url: publicUrl },
});
const scope = (attributes: Record<string, unknown>) => mapJob(base(attributes))?.remoteScope;

describe("mapJob with the saved real Get on Board response", () => {
  it("maps every job to a body that POST /postings accepts", () => {
    expect(fixture.data.length).toBeGreaterThan(5);
    for (const job of fixture.data) {
      const posting = mapJob(job);
      expect(posting, job.id).not.toBeNull();
      const parsed = CreatePostingSchema.safeParse(posting);
      expect(parsed.success, job.id).toBe(true);
      expect(posting).toMatchObject({ source: "getonboard", url: job.links?.public_url });
      expect(posting?.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(posting?.description.length).toBeGreaterThan(0);
      expect(posting?.description).not.toMatch(/<[a-z/]/i);
    }
  });

  it("maps remote_modality to a conservative remoteScope", () => {
    const byModality = (modality: string) =>
      fixture.data
        .filter((j) => j.attributes?.["remote_modality"] === modality)
        .map((j) => mapJob(j)?.remoteScope);
    expect(new Set(byModality("hybrid"))).toEqual(new Set(["onsite"]));
    expect(new Set(byModality("no_remote"))).toEqual(new Set(["onsite"]));
    expect(new Set(byModality("remote_local"))).toEqual(new Set(["country"]));
    expect(new Set(byModality("fully_remote"))).toEqual(new Set(["unknown"])); // "Remote" alone: the AI decides
  });

  it("takes company and public url from the response and joins the sections with their headlines", () => {
    const first = fixture.data[0];
    const posting = mapJob(first);
    const company = (first?.attributes?.["company"] as { data: { attributes: { name: string } } }).data.attributes.name;
    expect(posting?.company).toBe(company);
    expect(posting?.description).toContain(String(first?.attributes?.["functions_headline"]));
  });
});

describe("mapJob rules", () => {
  it("fully remote jobs: LatAm zone -> latam, one named country -> country, otherwise unknown", () => {
    expect(scope({ remote_zone: "LatAm" })).toBe("latam");
    expect(scope({ remote_zone: "Latin America" })).toBe("latam");
    expect(scope({ countries: ["Colombia"] })).toBe("country");
    expect(scope({ countries: ["Remote"] })).toBe("unknown");
    expect(scope({ countries: ["Chile", "Peru"] })).toBe("unknown");
  });

  it("never guesses: unexpected modality is unknown, hybrid and no_remote are onsite, remote_local is country", () => {
    expect(scope({ remote_modality: "teleport" })).toBe("unknown");
    expect(scope({ remote_modality: undefined })).toBe("unknown");
    expect(scope({ remote_modality: "hybrid", countries: ["Chile"] })).toBe("onsite");
    expect(scope({ remote_modality: "no_remote", countries: ["Chile"] })).toBe("onsite");
    expect(scope({ remote_modality: "remote_local", countries: ["Remote"] })).toBe("country");
  });

  it("builds a readable location, flagging remote_local restrictions", () => {
    expect(mapJob(base({ countries: ["Chile"] }))?.location).toBe("Chile");
    expect(mapJob(base({ countries: ["Remote"], remote_zone: "LatAm" }))?.location).toBe("Remote (LatAm)");
    expect(mapJob(base({ remote_modality: "remote_local", countries: ["Remote"] }))?.location).toMatch(/restricted to residents/);
    expect(mapJob(base({ countries: [] }))?.location).toBeUndefined();
  });

  it("falls back to 'Unknown company' and skips jobs without title or public url", () => {
    expect(mapJob(base({ company: { data: null } }))?.company).toBe("Unknown company");
    expect(mapJob(base({ title: "  " }))).toBeNull();
    expect(mapJob({ attributes: { title: "x" }, links: {} })).toBeNull();
    expect(mapJob(null)).toBeNull();
  });

  it("caps long fields and omits publishedAt when the date is missing or invalid", () => {
    const long = mapJob(base({ title: "T".repeat(500), description: `<p>${"a".repeat(MAX_DESCRIPTION * 2)}</p>` }));
    expect(long?.title).toHaveLength(300);
    expect(long?.description.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
    expect(CreatePostingSchema.safeParse(long).success).toBe(true);
    expect(mapJob(base({ published_at: undefined }))).not.toHaveProperty("publishedAt");
    expect(mapJob(base({ published_at: 1793299067 }))?.publishedAt).toBe(new Date(1793299067 * 1000).toISOString());
  });
});

describe("htmlToText", () => {
  it("keeps list structure and paragraphs", () => {
    expect(htmlToText("<p>Intro</p><ul><li>One</li><li>Two</li></ul>")).toBe("Intro\n\n- One\n- Two");
  });

  it("decodes entities without turning them into markup, in the right order", () => {
    expect(htmlToText("R&amp;D &lt;b&gt; &quot;x&quot; it&#39;s&nbsp;ok &#233;")).toBe('R&D <b> "x" it\'s ok é');
    expect(htmlToText("&amp;lt;")).toBe("&lt;");
  });

  it("drops script/style blocks, attributes and a truncated tag at the end", () => {
    expect(htmlToText('<style>p{}</style><a href="x" class="y">Link</a><script>alert(1)</script> end <li cla')).toBe("Link end");
  });

  it("returns an empty string for non-strings", () => {
    expect(htmlToText(undefined)).toBe("");
    expect(htmlToText(42)).toBe("");
  });
});

describe("publishedWithin", () => {
  const now = Date.UTC(2026, 10, 3, 12) ;
  const at = (hoursAgo: number) => base({ published_at: Math.floor((now - hoursAgo * 3600_000) / 1000) });
  it("keeps recent jobs, drops old ones and keeps jobs without a date", () => {
    expect(publishedWithin(at(1), 48, now)).toBe(true);
    expect(publishedWithin(at(48), 48, now)).toBe(true);
    expect(publishedWithin(at(49), 48, now)).toBe(false);
    expect(publishedWithin(base({ published_at: undefined }), 48, now)).toBe(true);
  });
});
