import { describe, expect, it, vi } from "vitest";
import { ApiError, ContractError, createApiClient } from "./client";

const POSTING = {
  id: "0b0b6b8e-0000-4000-8000-000000000001",
  title: "Backend Engineer",
  company: "Acme",
  url: "https://example.com/1",
  source: "manual",
  location: null,
  remoteScope: "unknown",
  description: "",
  publishedAt: null,
  createdAt: "2026-11-04T10:00:00.000Z",
  latestScore: null,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function clientWith(fetchFn: typeof fetch) {
  return createApiClient({ baseUrl: "/api/", fetchFn });
}

describe("api client", () => {
  it("lists postings with only the filters that have a value", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({ items: [POSTING], page: 1, pageSize: 25, total: 1 }));
    const result = await clientWith(fetchFn).listPostings({ verdict: "fit", q: "", page: 2 });
    expect(result.items).toHaveLength(1);
    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/postings?verdict=fit&page=2");
  });

  it("rejects a response that does not match the shared schema", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({ items: [{ nope: true }], page: 1, pageSize: 25, total: 1 }));
    await expect(clientWith(fetchFn).listPostings()).rejects.toBeInstanceOf(ContractError);
  });

  it("maps API errors to status and machine code", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ statusCode: 429, error: "ai_budget_exceeded", message: "Daily budget reached" }, 429));
    const error = await clientWith(fetchFn).scorePosting(POSTING.id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, code: "ai_budget_exceeded", message: "Daily budget reached" });
  });

  it("joins validation message arrays", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ statusCode: 400, error: "Bad Request", message: ["a is required", "b is invalid"] }, 400));
    const error = await clientWith(fetchFn).listPostings().catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 400, message: "a is required; b is invalid" });
  });

  it("reports an unreachable API as network_error", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    await expect(clientWith(fetchFn).listPostings()).rejects.toMatchObject({ status: 0, code: "network_error" });
  });

  it("returns null when the profile is not configured yet", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ statusCode: 404, error: "Not Found", message: "The candidate profile has not been configured yet" }, 404));
    await expect(clientWith(fetchFn).getProfile()).resolves.toBeNull();
  });

  it("sends JSON bodies with PUT /profile", async () => {
    const profile = {
      stack: ["TypeScript"],
      seniority: "senior",
      allowedLocations: ["BO"],
      maxEnglishLevel: "B1",
      excludedContractTypes: [],
      summary: "",
      education: [],
      experience: [],
      languages: [],
      certifications: [],
      version: 1,
      updatedAt: "2026-11-04T10:00:00.000Z",
    };
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json(profile));
    await clientWith(fetchFn).saveProfile({ stack: ["TypeScript"], seniority: "senior", allowedLocations: ["BO"], maxEnglishLevel: "B1" });
    const init = fetchFn.mock.calls[0]?.[1];
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toMatchObject({ stack: ["TypeScript"] });
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
  });

  it("uploads the CV as multipart without forcing a JSON content type, and parses the draft", async () => {
    const draft = {
      stack: ["TypeScript"],
      seniority: "senior",
      allowedLocations: [],
      maxEnglishLevel: "B1",
      excludedContractTypes: [],
      summary: "",
      education: [],
      experience: [],
      languages: [],
      certifications: [],
      warnings: ["location_missing"],
    };
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json(draft));
    const file = new File(["%PDF-1.4"], "cv.pdf", { type: "application/pdf" });
    const result = await clientWith(fetchFn).importCv(file);

    expect(result.warnings).toEqual(["location_missing"]);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe("/api/profile/import-cv");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get("file")).toBeInstanceOf(File);
    expect(new Headers(init?.headers).get("Content-Type")).toBeNull();
  });

  it("maps CV import errors by status and machine code", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ statusCode: 422, error: "cv_no_text", message: "no readable text" }, 422));
    const file = new File(["x"], "cv.pdf");
    await expect(clientWith(fetchFn).importCv(file)).rejects.toMatchObject({ status: 422, code: "cv_no_text" });
  });
});
