import { randomUUID } from "node:crypto";
import { NO_ADMINS, type AdminPolicy } from "../domain/admin-policy.js";
import { SESSION_TTL_MS, type Session } from "../domain/session.js";
import {
  EmailTakenError,
  normalizeEmail,
  passwordProblem,
  SignupDisabledError,
  WeakPasswordError,
  toAccount,
  type Account,
  type User,
} from "../domain/user.js";
import type {
  AttemptLimiter,
  Clock,
  PasswordHasher,
  SecureTokenGenerator,
  SessionRepository,
  UserRepository,
} from "../domain/ports.js";

export interface SessionGrant {
  user: Account;
  /** The cookie value. Shown to the client only now. */
  sessionToken: string;
  expiresAt: Date;
}

export const REGISTER_LIMIT = 20;
export const REGISTER_WINDOW_MS = 60 * 60 * 1000;

export class RegisterUser {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: SecureTokenGenerator,
    private readonly limiter: AttemptLimiter,
    private readonly clock: Clock,
    private readonly options: { signupAllowed: boolean },
    private readonly admins: AdminPolicy = NO_ADMINS,
  ) {}

  async execute(input: { email: string; password: string }, context: { ip: string }): Promise<SessionGrant> {
    if (!this.options.signupAllowed) throw new SignupDisabledError();

    // Every attempt counts, successful or not: it bounds account creation per address.
    const key = `register:ip:${context.ip}`;
    this.limiter.check(key, REGISTER_LIMIT, REGISTER_WINDOW_MS);
    this.limiter.record(key, REGISTER_WINDOW_MS);

    const email = normalizeEmail(input.email);
    const problem = passwordProblem(email, input.password);
    if (problem) throw new WeakPasswordError(problem);

    const now = this.clock.now();
    const user: User = {
      id: randomUUID(),
      email,
      passwordHash: await this.hasher.hash(input.password),
      googleSub: null,
      emailVerifiedAt: null,
      createdAt: now,
    };
    await this.users.create(user); // throws EmailTakenError

    const sessionToken = this.tokens.generate();
    const session: Session = {
      id: randomUUID(),
      userId: user.id,
      tokenHash: this.tokens.hash(sessionToken),
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      createdAt: now,
    };
    await this.sessions.create(session);
    return { user: toAccount(user, this.admins), sessionToken, expiresAt: session.expiresAt };
  }
}

export { EmailTakenError };
