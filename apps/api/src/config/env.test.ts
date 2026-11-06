import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const base = { DATABASE_URL: "postgresql://x" };

describe("loadEnv AI settings", () => {
  it("defaults to Anthropic and its recommended model", () => {
    expect(loadEnv(base)).toMatchObject({ AI_PROVIDER: "anthropic", AI_MODEL: "claude-sonnet-5-5" });
  });
  it("picks Groq's default model and treats an empty AI_MODEL as unset", () => {
    expect(loadEnv({ ...base, AI_PROVIDER: "groq", AI_MODEL: "" })).toMatchObject({ AI_MODEL: "openai/gpt-oss-20b" });
  });
  it("honours an explicit model and rejects unknown providers", () => {
    expect(loadEnv({ ...base, AI_PROVIDER: "groq", AI_MODEL: "openai/gpt-oss-120b" }).AI_MODEL).toBe("openai/gpt-oss-120b");
    expect(() => loadEnv({ ...base, AI_PROVIDER: "other" })).toThrow();
  });
});

describe("WEB_ORIGIN", () => {
  it("defaults to the dashboard dev server", () => {
    expect(loadEnv({ DATABASE_URL: "postgresql://x" }).WEB_ORIGIN).toEqual(["http://localhost:5173"]);
  });

  it("accepts several comma separated origins", () => {
    const env = loadEnv({ DATABASE_URL: "postgresql://x", WEB_ORIGIN: "https://a.example, https://b.example" });
    expect(env.WEB_ORIGIN).toEqual(["https://a.example", "https://b.example"]);
  });

  it("turns Google sign-in on only when the client id, the secret and the redirect URI are all set", () => {
    const base = { DATABASE_URL: "postgresql://x" };
    const all = { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_REDIRECT_URI: "http://localhost:3000/auth/google/callback" };
    expect(loadEnv(base).GOOGLE).toBeNull();
    expect(loadEnv({ ...base, ...all }).GOOGLE).toEqual({ clientId: "id", clientSecret: "secret", redirectUri: all.GOOGLE_REDIRECT_URI });
    expect(loadEnv({ ...base, ...all, GOOGLE_CLIENT_SECRET: "" }).GOOGLE).toBeNull();
    expect(loadEnv({ ...base, ...all, GOOGLE_REDIRECT_URI: "" }).GOOGLE).toBeNull();
    expect(() => loadEnv({ ...base, ...all, GOOGLE_REDIRECT_URI: "not a url" })).toThrow();
  });
});

describe("ADMIN_EMAILS", () => {
  it("is empty by default, and lowercases, trims and splits a comma separated list", () => {
    expect(loadEnv({ DATABASE_URL: "x" }).ADMIN_EMAILS).toEqual([]);
    expect(loadEnv({ DATABASE_URL: "x", ADMIN_EMAILS: " Boss@Example.com, ops@example.com ,," }).ADMIN_EMAILS).toEqual(["boss@example.com", "ops@example.com"]);
  });
});

describe("batch scoring queue", () => {
  const secret = "w".repeat(32);
  it("is in-process by default", () => {
    const env = loadEnv({ DATABASE_URL: "postgresql://x" });
    expect(env.SQS).toBeNull();
    expect(env.WORKER_SECRET).toBeUndefined();
  });
  it("uses SQS when a queue URL is set, with its region and optional endpoint", () => {
    const env = loadEnv({ DATABASE_URL: "x", SQS_QUEUE_URL: "http://q/1/jobs", WORKER_SECRET: secret, AWS_ENDPOINT_URL: "http://localhost:4566" });
    expect(env.SQS).toEqual({ queueUrl: "http://q/1/jobs", region: "us-east-1", endpoint: "http://localhost:4566" });
  });
  it("requires a worker secret of 32+ characters whenever a queue URL is set", () => {
    expect(() => loadEnv({ DATABASE_URL: "x", SQS_QUEUE_URL: "http://q/1/jobs" })).toThrow(/WORKER_SECRET/);
    expect(() => loadEnv({ DATABASE_URL: "x", SQS_QUEUE_URL: "http://q/1/jobs", WORKER_SECRET: "short" })).toThrow();
  });
  it("treats empty values as unset", () => {
    expect(loadEnv({ DATABASE_URL: "x", SQS_QUEUE_URL: "", WORKER_SECRET: "" }).SQS).toBeNull();
  });
});

describe("production switches", () => {
  const base = { DATABASE_URL: "x" };
  it("serves Swagger by default and not when NODE_ENV=production, unless asked", () => {
    expect(loadEnv(base).SWAGGER_ENABLED).toBe(true);
    expect(loadEnv({ ...base, NODE_ENV: "production" }).SWAGGER_ENABLED).toBe(false);
    expect(loadEnv({ ...base, NODE_ENV: "production", SWAGGER_ENABLED: "true" }).SWAGGER_ENABLED).toBe(true);
    expect(loadEnv({ ...base, SWAGGER_ENABLED: "false" }).SWAGGER_ENABLED).toBe(false);
    expect(() => loadEnv({ ...base, SWAGGER_ENABLED: "maybe" })).toThrow();
  });
  it("trusts no proxy by default and accepts a small hop count only", () => {
    expect(loadEnv(base).TRUST_PROXY).toBe(0);
    expect(loadEnv({ ...base, TRUST_PROXY: "1" }).TRUST_PROXY).toBe(1);
    expect(() => loadEnv({ ...base, TRUST_PROXY: "-1" })).toThrow();
    expect(() => loadEnv({ ...base, TRUST_PROXY: "9" })).toThrow();
  });
});

describe("AI_GLOBAL_DAILY_BUDGET_USD", () => {
  const base = { DATABASE_URL: "x" };
  it("is unset by default and when empty (an empty value must not mean 0, which would block all AI)", () => {
    expect(loadEnv(base).AI_GLOBAL_DAILY_BUDGET_USD).toBeUndefined();
    expect(loadEnv({ ...base, AI_GLOBAL_DAILY_BUDGET_USD: "" }).AI_GLOBAL_DAILY_BUDGET_USD).toBeUndefined();
  });
  it("accepts a number, including 0, and rejects negatives and text", () => {
    expect(loadEnv({ ...base, AI_GLOBAL_DAILY_BUDGET_USD: "2" }).AI_GLOBAL_DAILY_BUDGET_USD).toBe(2);
    expect(loadEnv({ ...base, AI_GLOBAL_DAILY_BUDGET_USD: "0" }).AI_GLOBAL_DAILY_BUDGET_USD).toBe(0);
    expect(() => loadEnv({ ...base, AI_GLOBAL_DAILY_BUDGET_USD: "-1" })).toThrow();
    expect(() => loadEnv({ ...base, AI_GLOBAL_DAILY_BUDGET_USD: "abc" })).toThrow();
  });
});
