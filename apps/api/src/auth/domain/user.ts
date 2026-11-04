export interface User {
  readonly id: string;
  /** Lowercase, trimmed. */
  readonly email: string;
  readonly passwordHash: string;
  readonly createdAt: Date;
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
