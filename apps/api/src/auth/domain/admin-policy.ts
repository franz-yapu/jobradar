import type { User } from "./user.js";

export const ADMIN_POLICY = Symbol("ADMIN_POLICY");

/** Decides who may feed the shared job catalog (ADR-0004). */
export interface AdminPolicy {
  isAdmin(user: Pick<User, "email" | "emailVerifiedAt">): boolean;
}

/**
 * Administrators are listed by email in configuration, and the email must be verified by an identity provider.
 * Password sign-ups never verify their email, so registering someone else's address does not make an administrator.
 */
export class EmailAdminPolicy implements AdminPolicy {
  private readonly emails: ReadonlySet<string>;

  constructor(emails: readonly string[]) {
    this.emails = new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean));
  }

  isAdmin(user: Pick<User, "email" | "emailVerifiedAt">): boolean {
    return user.emailVerifiedAt !== null && this.emails.has(user.email.toLowerCase());
  }
}

export const NO_ADMINS: AdminPolicy = { isAdmin: () => false };
