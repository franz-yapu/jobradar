import { describe, expect, it } from "vitest";
import { EmailAdminPolicy, NO_ADMINS } from "./admin-policy.js";

const verified = new Date("2026-11-04T10:00:00Z");

describe("EmailAdminPolicy", () => {
  const policy = new EmailAdminPolicy(["Boss@Example.com", " ops@example.com "]);

  it("accepts a listed email that an identity provider verified, ignoring case and spaces", () => {
    expect(policy.isAdmin({ email: "boss@example.com", emailVerifiedAt: verified })).toBe(true);
    expect(policy.isAdmin({ email: "OPS@example.com", emailVerifiedAt: verified })).toBe(true);
  });

  it("never accepts an unverified email, so registering an administrator's address with a password gives nothing", () => {
    expect(policy.isAdmin({ email: "boss@example.com", emailVerifiedAt: null })).toBe(false);
  });

  it("refuses emails that are not listed, and an empty list means nobody", () => {
    expect(policy.isAdmin({ email: "someone@example.com", emailVerifiedAt: verified })).toBe(false);
    expect(new EmailAdminPolicy([]).isAdmin({ email: "", emailVerifiedAt: verified })).toBe(false);
    expect(NO_ADMINS.isAdmin({ email: "boss@example.com", emailVerifiedAt: verified })).toBe(false);
  });
});
