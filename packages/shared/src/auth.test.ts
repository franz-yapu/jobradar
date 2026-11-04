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
