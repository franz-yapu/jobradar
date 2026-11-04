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

  describe("accounts", () => {
    const USER = { id: "0b0b6b8e-0000-4000-8000-000000000001", email: "jane@example.com" };
    const TOKEN = {
      id: "0b0b6b8e-0000-4000-8000-000000000002",
      name: "n8n",
      prefix: "jr_abcde",
      createdAt: "2026-11-04T10:00:00.000Z",
      lastUsedAt: null,
      revokedAt: null,
    };
    const empty = (status = 204) => new Response(null, { status });

    it("sends the session cookie with every call, so the app never handles a token itself", async () => {
      const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({ items: [], page: 1, pageSize: 25, total: 0 }));
      await clientWith(fetchFn).listPostings();
      expect(fetchFn.mock.calls[0]?.[1]?.credentials).toBe("include");
    });

    it("registers and logs in with a JSON body", async () => {
      const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json(USER, 201));
      const client = clientWith(fetchFn);
      await expect(client.register("jane@example.com", "a-long-password")).resolves.toEqual(USER);
      fetchFn.mockResolvedValue(json(USER));
      await expect(client.login("jane@example.com", "a-long-password")).resolves.toEqual(USER);

      const [registerCall, loginCall] = fetchFn.mock.calls;
      expect(registerCall?.[0]).toBe("/api/auth/register");
      expect(JSON.parse(String(registerCall?.[1]?.body))).toEqual({ email: "jane@example.com", password: "a-long-password" });
      expect(loginCall?.[0]).toBe("/api/auth/login");
      expect(loginCall?.[1]?.method).toBe("POST");
    });

    it("maps login failures to their machine code without treating them as a lost session", async () => {
      const lost = vi.fn();
      const fetchFn = vi
        .fn<typeof fetch>()
        .mockResolvedValue(json({ statusCode: 401, error: "invalid_credentials", message: "Invalid email or password" }, 401));
      const client = createApiClient({ baseUrl: "/api", fetchFn, onUnauthorized: lost });
      await expect(client.login("a@b.co", "wrong")).rejects.toMatchObject({ status: 401, code: "invalid_credentials" });
      expect(lost).not.toHaveBeenCalled();
    });

    it("me() is null when nobody is logged in, and that is not a lost session either", async () => {
      const lost = vi.fn();
      const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({ statusCode: 401, error: "unauthenticated", message: "x" }, 401));
      const client = createApiClient({ baseUrl: "/api", fetchFn, onUnauthorized: lost });
      await expect(client.me()).resolves.toBeNull();
      expect(lost).not.toHaveBeenCalled();

      fetchFn.mockResolvedValue(json(USER));
      await expect(client.me()).resolves.toEqual(USER);
    });

    it("tells the app when a protected call finds the session gone", async () => {
      const lost = vi.fn();
      const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json({ statusCode: 401, error: "unauthenticated", message: "x" }, 401));
      const client = createApiClient({ baseUrl: "/api", fetchFn, onUnauthorized: lost });
      await expect(client.listPostings()).rejects.toMatchObject({ status: 401 });
      expect(lost).toHaveBeenCalledTimes(1);
    });

    it("logs out and revokes tokens through 204 answers", async () => {
      const fetchFn = vi.fn<typeof fetch>().mockImplementation(async () => empty());
      const client = clientWith(fetchFn);
      await expect(client.logout()).resolves.toBeUndefined();
      await expect(client.revokeApiToken(TOKEN.id)).resolves.toBeUndefined();
      expect(fetchFn.mock.calls[0]?.[1]?.method).toBe("POST");
      expect(fetchFn.mock.calls[1]).toMatchObject([`/api/auth/tokens/${TOKEN.id}`, { method: "DELETE" }]);
    });

    it("lists tokens (no secret) and receives the secret only when creating one", async () => {
      const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json([TOKEN]));
      const client = clientWith(fetchFn);
      const listed = await client.listApiTokens();
      expect(listed).toEqual([TOKEN]);
      expect(listed[0]).not.toHaveProperty("token");

      fetchFn.mockResolvedValue(json({ ...TOKEN, token: "jr_secret-value" }, 201));
      const created = await client.createApiToken("n8n");
      expect(created.token).toBe("jr_secret-value");
      expect(JSON.parse(String(fetchFn.mock.calls[1]?.[1]?.body))).toEqual({ name: "n8n" });
    });

    it("refuses a token list that carries something unexpected", async () => {
      const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json([{ id: "not-a-uuid" }]));
      await expect(clientWith(fetchFn).listApiTokens()).rejects.toBeInstanceOf(ContractError);
    });
  });
});
