import { randomUUID } from "node:crypto";
import { NO_ADMINS, type AdminPolicy } from "../domain/admin-policy.js";
import { SESSION_TTL_MS, type Session } from "../domain/session.js";
import { InvalidCredentialsError, normalizeEmail, toAccount } from "../domain/user.js";
import type {
  AttemptLimiter,
  Clock,
  PasswordHasher,
  SecureTokenGenerator,
  SessionRepository,
  UserRepository,
} from "../domain/ports.js";
import type { SessionGrant } from "./register-user.use-case.js";

export const LOGIN_EMAIL_LIMIT = 5;
export const LOGIN_IP_LIMIT = 20;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export class LoginUser {
  /** Verified against when the email is unknown, so the response takes as long as a real check. */
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: SecureTokenGenerator,
    private readonly limiter: AttemptLimiter,
    private readonly clock: Clock,
    private readonly admins: AdminPolicy = NO_ADMINS,
  ) {}

  async execute(input: { email: string; password: string }, context: { ip: string }): Promise<SessionGrant> {
    const email = normalizeEmail(input.email);
    const emailKey = `login:email:${email}`;
    const ipKey = `login:ip:${context.ip}`;
    this.limiter.check(emailKey, LOGIN_EMAIL_LIMIT, LOGIN_WINDOW_MS);
    this.limiter.check(ipKey, LOGIN_IP_LIMIT, LOGIN_WINDOW_MS);

    const user = await this.users.findByEmail(email);
    // An unknown email and an account without a password (created with Google) both verify against a dummy
    // hash, so the answer and the time taken do not reveal which case it was.
    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const matches = await this.hasher.verify(input.password, hash);
    if (!user || user.passwordHash === null || !matches) {
      this.limiter.record(emailKey, LOGIN_WINDOW_MS);
      this.limiter.record(ipKey, LOGIN_WINDOW_MS);
      throw new InvalidCredentialsError();
    }
    this.limiter.reset(emailKey);

    const now = this.clock.now();
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

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hasher.hash(randomUUID());
    return this.dummyHash;
  }
}
