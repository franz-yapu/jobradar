import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface Node {
  name: string;
  type: string;
  parameters: Record<string, unknown> & {
    jsCode?: string;
    url?: string;
    headerParameters?: { parameters: { name: string; value: string }[] };
  };
}
interface Workflow {
  id: string;
  name: string;
  active: boolean;
  nodes: Node[];
  connections: Record<string, { main: { node: string }[][] }>;
}

const root = new URL("../../../n8n/", import.meta.url);
const dir = new URL("workflows/", root);
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const raw = (file: string) => readFileSync(new URL(file, dir), "utf8");
const load = (file: string) => JSON.parse(raw(file)) as Workflow;

const ALLOWED_TYPES = new Set([
  "n8n-nodes-base.scheduleTrigger",
  "n8n-nodes-base.manualTrigger",
  "n8n-nodes-base.code",
  "n8n-nodes-base.httpRequest",
  "n8n-nodes-base.splitInBatches",
  "n8n-nodes-base.if",
  "n8n-nodes-base.telegram",
  "n8n-nodes-base.noOp",
]);

// Things that must never be committed in an exported workflow.
const SECRET_PATTERNS: [string, RegExp][] = [
  ["Telegram bot token", /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/],
  ["Groq key", /\bgsk_[A-Za-z0-9]{20,}/],
  ["Anthropic key", /\bsk-ant-[A-Za-z0-9_-]{10,}/],
  ["bearer token", /Bearer\s+[A-Za-z0-9._-]{20,}/],
  ["JobRadar API token", /\bjr_[A-Za-z0-9_-]{30,}/],
];

it("has at least the collect workflow", () => {
  expect(files).toContain("01-collect-getonboard.json");
});

describe.each(files)("n8n workflow %s", (file) => {
  const wf = load(file);

  it("has an id and a name, and is exported inactive", () => {
    expect(wf.id).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(wf.name).toMatch(/^JobRadar - /);
    expect(wf.active).toBe(false);
  });

  it("uses unique node names and only allowed node types", () => {
    const names = wf.nodes.map((n) => n.name);
    expect(new Set(names).size).toBe(names.length);
    for (const node of wf.nodes) expect(ALLOWED_TYPES.has(node.type), `${node.name}: ${node.type}`).toBe(true);
  });

  it("connects only existing nodes and leaves no node unreachable", () => {
    const names = new Set(wf.nodes.map((n) => n.name));
    const reachable = new Set(
      wf.nodes.filter((n) => n.type.endsWith("Trigger")).map((n) => n.name),
    );
    for (const [source, { main }] of Object.entries(wf.connections)) {
      expect(names.has(source), `source ${source}`).toBe(true);
      for (const target of main.flat()) expect(names.has(target.node), `${source} -> ${target.node}`).toBe(true);
    }
    for (let changed = true; changed; ) {
      changed = false;
      for (const [source, { main }] of Object.entries(wf.connections)) {
        if (!reachable.has(source)) continue;
        for (const { node } of main.flat()) if (!reachable.has(node)) changed = reachable.add(node).has(node);
      }
    }
    expect([...names].filter((n) => !reachable.has(n))).toEqual([]);
  });

  it("contains no secrets", () => {
    for (const [label, pattern] of SECRET_PATTERNS) expect(raw(file), label).not.toMatch(pattern);
  });

  it("reaches the JobRadar API only through $env.JOBRADAR_API_URL", () => {
    for (const node of wf.nodes) {
      const url = node.parameters.url ?? "";
      expect(url, node.name).not.toMatch(/localhost|127\.0\.0\.1|host\.docker\.internal/);
      if (url.includes("/postings")) expect(url, node.name).toMatch(/^=\{\{ \$env\.JOBRADAR_API_URL \}\}\//);
    }
  });
});

/** Every request node, with whether it talks to the JobRadar API (the URL comes from the environment). */
const requests = (wf: Workflow) =>
  wf.nodes
    .filter((n) => n.type === "n8n-nodes-base.httpRequest")
    .map((node) => ({ node, toJobRadar: (node.parameters.url ?? "").includes("$env.JOBRADAR_API_URL") }));
const authHeader = (node: Node) => node.parameters.headerParameters?.parameters.find((h) => h.name === "Authorization");

describe.each(files)("API token in %s", (file) => {
  const wf = load(file);

  it("sends the API token from the environment on every call to the JobRadar API", () => {
    const calls = requests(wf).filter((r) => r.toJobRadar);
    expect(calls.length).toBeGreaterThan(0);
    for (const { node } of calls) {
      expect(node.parameters["sendHeaders"], node.name).toBe(true);
      expect(authHeader(node)?.value, node.name).toBe("=Bearer {{ $env.JOBRADAR_API_TOKEN }}");
    }
  });

  it("never sends the token anywhere else (e.g. to Get on Board)", () => {
    for (const { node } of requests(wf).filter((r) => !r.toJobRadar)) {
      expect(authHeader(node), node.name).toBeUndefined();
      expect(JSON.stringify(node.parameters), node.name).not.toContain("JOBRADAR_API_TOKEN");
    }
  });
});

describe("01-collect-getonboard.json", () => {
  const wf = load("01-collect-getonboard.json");
  const node = (name: string) => {
    const found = wf.nodes.find((n) => n.name === name);
    if (!found) throw new Error(`node ${name} not found`);
    return found;
  };

  it("embeds the tested mapper verbatim at the top of the Map jobs node", () => {
    const mapper = readFileSync(new URL("code/map-job.js", root), "utf8");
    expect(node("Map jobs").parameters.jsCode?.startsWith(mapper)).toBe(true);
  });

  it("runs every 6 hours and can also be started manually", () => {
    expect(JSON.stringify(node("Every 6 hours").parameters)).toContain('"hoursInterval":6');
    expect(wf.connections["Run manually"]).toBeDefined();
  });

  it("scores at most 20 new postings per run and stops when the budget is spent", () => {
    expect(node("Pick new postings").parameters.jsCode).toMatch(/MAX_SCORES_PER_RUN = 20;/);
    const guard = JSON.stringify(node("Budget left?").parameters);
    expect(guard).toContain("429");
    expect(guard).toContain("notEquals");
  });

  it("does not fail the run on API statuses such as 409 or 429", () => {
    for (const name of ["Create posting", "Score posting"]) {
      expect(JSON.stringify(node(name).parameters), name).toContain('"neverError":true');
    }
  });

  it("identifies itself to Get on Board and asks for the company data", () => {
    const params = JSON.stringify(node("Fetch Get on Board page").parameters);
    expect(params).toContain("jobradar-n8n");
    expect(params).toContain("expand");
  });
});

describe("02-daily-summary-telegram.json", () => {
  const wf = load("02-daily-summary-telegram.json");
  const node = (name: string) => {
    const found = wf.nodes.find((n) => n.name === name);
    if (!found) throw new Error(`node ${name} not found`);
    return found;
  };

  it("embeds the tested formatter verbatim at the top of the Build summary node", () => {
    const formatter = readFileSync(new URL("code/build-summary.js", root), "utf8");
    expect(node("Build summary").parameters.jsCode?.startsWith(formatter)).toBe(true);
  });

  it("runs every day at 08:00 La Paz time and can also be started manually", () => {
    const params = JSON.stringify(node("Every day at 08:00").parameters);
    expect(params).toContain('"daysInterval":1');
    expect(params).toContain('"triggerAtHour":8');
    expect(JSON.stringify(wf)).toContain('"timezone":"America/La_Paz"');
    expect(wf.connections["Run manually"]).toBeDefined();
  });

  it("reads the last 24 h with createdSince and sends to a chat id taken from the environment", () => {
    expect(JSON.stringify(node("Fetch recent postings").parameters)).toContain("createdSince");
    const send = node("Send to Telegram").parameters;
    expect(send["chatId"]).toBe("={{ $env.TELEGRAM_CHAT_ID }}");
    expect(send["text"]).toBe("={{ $json.text }}");
  });

  it("references the Telegram credential by name only (the token lives in n8n)", () => {
    const credentials = (node("Send to Telegram") as unknown as { credentials: Record<string, Record<string, string>> }).credentials;
    expect(Object.keys(credentials)).toEqual(["telegramApi"]);
    expect(Object.keys(credentials["telegramApi"] ?? {}).sort()).toEqual(["id", "name"]);
  });

  it("fails loudly instead of claiming 'no postings' when the API did not answer", () => {
    expect(node("Build summary").parameters.jsCode).toContain("did not answer");
  });
});

describe("the collect workflow fails loudly when the API rejects its token", () => {
  const code = load("01-collect-getonboard.json").nodes.find((n) => n.name === "Pick new postings")?.parameters.jsCode ?? "";
  const run = (statuses: number[]) =>
    new Function("$input", code)({
      all: () => statuses.map((statusCode, i) => ({ json: { statusCode, body: { id: `id-${i}`, title: `T${i}` } } })),
    }) as { json: { postingId: string } }[];

  it("throws on a 401 instead of reporting 'nothing new'", () => {
    expect(() => run([401, 401])).toThrow(/rejected the API token/);
    expect(() => run([201, 401])).toThrow(/JOBRADAR_API_TOKEN/);
  });

  it("still scores only the new postings (201) and ignores the already known ones (409)", () => {
    expect(run([201, 409, 201]).map((item) => item.json.postingId)).toEqual(["id-0", "id-2"]);
  });

  it("keeps the cap of 20 scored postings per run", () => {
    expect(run(Array.from({ length: 30 }, () => 201))).toHaveLength(20);
  });
});
