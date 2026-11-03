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
