export interface User {
  readonly id: string;
  /** Lowercase, trimmed. */
  readonly email: string;
  /** Null for an account created with Google that has not set a password. */
  readonly passwordHash: string | null;
  /** Google's stable subject id, when Google is connected. Accounts are keyed by it, never by email. */
  readonly googleSub: string | null;
  /** Set when the email was verified by an identity provider (Google); password sign-ups stay null. */
  readonly emailVerifiedAt: Date | null;
  readonly createdAt: Date;
}

/** What the account screen needs to know about a user; never a hash or a provider id. */
export interface Account extends AuthenticatedUser {
  readonly hasPassword: boolean;
  readonly googleLinked: boolean;
  readonly emailVerified: boolean;
}

export function toAccount(user: User): Account {
  return {
    id: user.id,
    email: user.email,
    hasPassword: user.passwordHash !== null,
    googleLinked: user.googleSub !== null,
    emailVerified: user.emailVerifiedAt !== null,
  };
}

/** Who is making a request, once authenticated. */
export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
}

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Returns why the password is not acceptable, or null when it is. */
export function passwordProblem(email: string, password: string): "too_short" | "too_long" | "same_as_email" | null {
  if (password.length < MIN_PASSWORD_LENGTH) return "too_short";
  if (password.length > MAX_PASSWORD_LENGTH) return "too_long";
  if (password.trim().toLowerCase() === normalizeEmail(email)) return "same_as_email";
  return null;
}

export class EmailTakenError extends Error {
  constructor() {
    super("An account with this email already exists");
    this.name = "EmailTakenError";
  }
}

export class WeakPasswordError extends Error {
  constructor(public readonly reason: "too_short" | "too_long" | "same_as_email") {
    super(`The password is not acceptable (${reason})`);
    this.name = "WeakPasswordError";
  }
}

export class PasswordRequiredError extends Error {
  constructor() {
    super("Set a password before disconnecting Google, or you could not log in");
    this.name = "PasswordRequiredError";
  }
}

export class PasswordExistsError extends Error {
  constructor() {
    super("This account already has a password");
    this.name = "PasswordExistsError";
  }
}

export class SignupDisabledError extends Error {
  constructor() {
    super("Registration is closed");
    this.name = "SignupDisabledError";
  }
}

/** Same error for an unknown email and for a wrong password: the answer must not reveal which. */
export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password");
    this.name = "InvalidCredentialsError";
  }
}

export class TooManyAttemptsError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Too many attempts, try again later");
    this.name = "TooManyAttemptsError";
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "UnauthenticatedError";
  }
}
