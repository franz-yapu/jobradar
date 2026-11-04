import { describe, expect, it } from "vitest";
import { LoginSchema, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, RegisterSchema } from "./auth.js";

describe("RegisterSchema", () => {
  it("trims and lowercases the email", () => {
    const parsed = RegisterSchema.parse({ email: "  Jane.Doe@Example.COM ", password: "a-long-password" });
    expect(parsed.email).toBe("jane.doe@example.com");
  });

  it("rejects a malformed email", () => {
    for (const email of ["", "jane", "jane@", "@example.com", "jane @example.com"]) {
      expect(RegisterSchema.safeParse({ email, password: "a-long-password" }).success).toBe(false);
    }
  });

  it("enforces the password length window", () => {
    const email = "jane@example.com";
    expect(RegisterSchema.safeParse({ email, password: "x".repeat(MIN_PASSWORD_LENGTH - 1) }).success).toBe(false);
    expect(RegisterSchema.safeParse({ email, password: "x".repeat(MIN_PASSWORD_LENGTH) }).success).toBe(true);
    expect(RegisterSchema.safeParse({ email, password: "x".repeat(MAX_PASSWORD_LENGTH) }).success).toBe(true);
    expect(RegisterSchema.safeParse({ email, password: "x".repeat(MAX_PASSWORD_LENGTH + 1) }).success).toBe(false);
  });

  it("keeps spaces inside the password untouched", () => {
    expect(RegisterSchema.parse({ email: "a@b.co", password: "  spaced out pass  " }).password).toBe("  spaced out pass  ");
  });
});

describe("LoginSchema", () => {
  it("accepts a short password, so the answer is invalid credentials and not a length rule", () => {
    expect(LoginSchema.safeParse({ email: "jane@example.com", password: "short" }).success).toBe(true);
  });

  it("rejects an empty password and an oversized one (bounds the hashing work)", () => {
    expect(LoginSchema.safeParse({ email: "jane@example.com", password: "" }).success).toBe(false);
    expect(LoginSchema.safeParse({ email: "jane@example.com", password: "x".repeat(MAX_PASSWORD_LENGTH + 1) }).success).toBe(false);
  });
});

describe("API token schemas", () => {
  it("trims the name and bounds its length", async () => {
    const { CreateApiTokenSchema, MAX_API_TOKEN_NAME_LENGTH } = await import("./auth.js");
    expect(CreateApiTokenSchema.parse({ name: "  n8n  " }).name).toBe("n8n");
    expect(CreateApiTokenSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(CreateApiTokenSchema.safeParse({ name: "x".repeat(MAX_API_TOKEN_NAME_LENGTH + 1) }).success).toBe(false);
  });

  it("a listed token has no secret field, a created one adds it", async () => {
    const { ApiTokenSchema, CreatedApiTokenSchema } = await import("./auth.js");
    const listed = {
      id: "0b0b6b8e-0000-4000-8000-000000000001",
      name: "n8n",
      prefix: "jr_abcde",
      createdAt: "2026-11-04T10:00:00.000Z",
      lastUsedAt: null,
      revokedAt: null,
    };
    expect(ApiTokenSchema.safeParse(listed).success).toBe(true);
    expect(CreatedApiTokenSchema.safeParse(listed).success).toBe(false);
    expect(CreatedApiTokenSchema.safeParse({ ...listed, token: "jr_secret" }).success).toBe(true);
  });
});
