import { randomUUID, timingSafeEqual } from "node:crypto";
import { IdentityVerificationError, type IdentityProvider } from "../domain/identity-provider.js";
import { OAUTH_FLOW_TTL_MS, safeReturnTo, type GoogleFailure, type OAuthIntent } from "../domain/oauth-flow.js";
import type {
  AttemptLimiter,
  Clock,
  OAuthFlowRepository,
  PasswordHasher,
  PkceGenerator,
  SecureTokenGenerator,
  SessionRepository,
  UserRepository,
} from "../domain/ports.js";
import { SESSION_TTL_MS } from "../domain/session.js";
import {
  EmailTakenError,
  PasswordExistsError,
  PasswordRequiredError,
  passwordProblem,
  toAccount,
  UnauthenticatedError,
  WeakPasswordError,
  type User,
} from "../domain/user.js";
import type { SessionGrant } from "./register-user.use-case.js";

export const GOOGLE_START_LIMIT = 30;
export const GOOGLE_CALLBACK_LIMIT = 30;
export const GOOGLE_WINDOW_MS = 15 * 60 * 1000;
const REGISTER_LIMIT = 20;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

export class StartGoogleFlow {
  constructor(
    private readonly provider: IdentityProvider,
    private readonly flows: OAuthFlowRepository,
    private readonly tokens: SecureTokenGenerator,
    private readonly pkce: PkceGenerator,
    private readonly limiter: AttemptLimiter,
    private readonly clock: Clock,
  ) {}

  /**
   * Prepares one attempt and returns where to send the browser plus the raw `state`, which the controller
   * keeps in a cookie so only this browser can finish the attempt. Intent "link" needs the logged-in user.
   */
  async execute(
    input: { intent: OAuthIntent; userId: string | null; returnTo: string | undefined },
    context: { ip: string },
  ): Promise<{ redirectUrl: string; state: string }> {
    const key = `google:start:ip:${context.ip}`;
    this.limiter.check(key, GOOGLE_START_LIMIT, GOOGLE_WINDOW_MS);
    this.limiter.record(key, GOOGLE_WINDOW_MS);
    if (input.intent === "link" && input.userId === null) throw new UnauthenticatedError();

    const now = this.clock.now();
    await this.flows.deleteExpired(now);
    const state = this.tokens.generate();
    const nonce = this.tokens.generate();
    const { codeVerifier, codeChallenge } = this.pkce.generate();
    await this.flows.create({
      id: randomUUID(),
      stateHash: this.tokens.hash(state),
      nonce,
      codeVerifier,
      intent: input.intent,
      userId: input.intent === "link" ? input.userId : null,
      returnTo: safeReturnTo(input.returnTo),
      expiresAt: new Date(now.getTime() + OAUTH_FLOW_TTL_MS),
    });
    return { redirectUrl: this.provider.authorizationUrl({ state, nonce, codeChallenge }), state };
  }
}

export type CompleteResult =
  | { type: "signed_in"; grant: SessionGrant; returnTo: string }
  | { type: "linked"; returnTo: string }
  /** `detail` is for the server log only. */
  | { type: "failed"; code: GoogleFailure; intent: OAuthIntent; detail: string };

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export class CompleteGoogleFlow {
  constructor(
    private readonly provider: IdentityProvider,
    private readonly flows: OAuthFlowRepository,
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly tokens: SecureTokenGenerator,
    private readonly limiter: AttemptLimiter,
    private readonly clock: Clock,
    private readonly options: { signupAllowed: boolean },
  ) {}

  /**
   * `state` comes from the URL Google redirected to, `cookieState` from the cookie set when the attempt
   * began: both must match the stored flow. A flow is consumed on first use, so a replay finds nothing.
   * Failures are returned (not thrown) because the browser is redirected to a screen with a generic code.
   */
  async execute(
    input: { code: string | undefined; state: string | undefined; providerError: boolean },
    context: { ip: string; cookieState: string | undefined },
  ): Promise<CompleteResult> {
    const failed = (code: GoogleFailure, intent: OAuthIntent, detail: string): CompleteResult => ({ type: "failed", code, intent, detail });

    const key = `google:callback:ip:${context.ip}`;
    try {
      this.limiter.check(key, GOOGLE_CALLBACK_LIMIT, GOOGLE_WINDOW_MS);
    } catch {
      return failed("too_many_attempts", "login", "callback throttled");
    }
    this.limiter.record(key, GOOGLE_WINDOW_MS);

    if (!input.state) return failed("google_failed", "login", "missing state");
    const now = this.clock.now();
    const flow = await this.flows.consume(this.tokens.hash(input.state), now);
    if (!flow) return failed("google_failed", "login", "unknown, used or expired state");
    const { intent } = flow;
    if (!context.cookieState || !sameSecret(context.cookieState, input.state)) {
      return failed("google_failed", intent, "state cookie missing or different (another browser?)");
    }
    if (input.providerError || !input.code) return failed("google_failed", intent, "the user cancelled or Google reported an error");

    let identity;
    try {
      identity = await this.provider.verifyCallback({ code: input.code, codeVerifier: flow.codeVerifier, nonce: flow.nonce });
    } catch (error) {
      if (error instanceof IdentityVerificationError) return failed("google_failed", intent, error.message);
      throw error;
    }

    if (intent === "link") return this.link(flow.userId, identity, flow.returnTo, now);

    const known = await this.users.findByGoogleSub(identity.sub);
    if (known) return { type: "signed_in", grant: await this.openSession(known, now), returnTo: flow.returnTo };

    // Never link by email: password accounts have unverified emails (ADR-0003). The owner connects Google
    // from inside the account, after proving the password.
    if (await this.users.findByEmail(identity.email)) {
      return failed("google_link_required", "login", "a password account already uses this email");
    }
    if (!this.options.signupAllowed) return failed("signup_disabled", "login", "registration is closed");
    try {
      const registerKey = `register:ip:${context.ip}`;
      this.limiter.check(registerKey, REGISTER_LIMIT, REGISTER_WINDOW_MS);
      this.limiter.record(registerKey, REGISTER_WINDOW_MS);
    } catch {
      return failed("too_many_attempts", "login", "registration throttled");
    }
    const user: User = {
      id: randomUUID(),
      email: identity.email,
      passwordHash: null,
      googleSub: identity.sub,
      emailVerifiedAt: now,
      createdAt: now,
    };
    try {
      await this.users.create(user);
    } catch (error) {
      if (error instanceof EmailTakenError) return failed("google_link_required", "login", "email taken during sign-up");
      throw error;
    }
    return { type: "signed_in", grant: await this.openSession(user, now), returnTo: flow.returnTo };
  }

  private async link(userId: string | null, identity: { sub: string; email: string }, returnTo: string, now: Date): Promise<CompleteResult> {
    const user = userId ? await this.users.findById(userId) : null;
    if (!user) return { type: "failed", code: "google_failed", intent: "link", detail: "the account of this attempt no longer exists" };
    if (user.googleSub === identity.sub) return { type: "linked", returnTo };
    if (user.googleSub !== null) return { type: "failed", code: "google_taken", intent: "link", detail: "this account already has another Google identity" };
    // Google only verified the address it knows; if it is the account's own address, the account is verified too.
    const verified = identity.email === user.email ? (user.emailVerifiedAt ?? now) : user.emailVerifiedAt;
    const result = await this.users.linkGoogle(user.id, identity.sub, verified);
    if (result === "taken") return { type: "failed", code: "google_taken", intent: "link", detail: "that Google identity belongs to another account" };
    return { type: "linked", returnTo };
  }

  /** Always a brand-new session: nothing from before the login is reused. */
  private async openSession(user: User, now: Date): Promise<SessionGrant> {
    const sessionToken = this.tokens.generate();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await this.sessions.create({ id: randomUUID(), userId: user.id, tokenHash: this.tokens.hash(sessionToken), expiresAt, createdAt: now });
    return { user: toAccount(user), sessionToken, expiresAt };
  }
}

export class UnlinkGoogle {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthenticatedError();
    if (user.googleSub === null) return;
    if (!(await this.users.unlinkGoogleIfPassword(userId))) throw new PasswordRequiredError();
  }
}

export class SetPassword {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  /** For an account created with Google: gives it a password so it can also log in with email and password. */
  async execute(userId: string, password: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthenticatedError();
    if (user.passwordHash !== null) throw new PasswordExistsError();
    const problem = passwordProblem(user.email, password);
    if (problem) throw new WeakPasswordError(problem);
    if (!(await this.users.setPasswordIfNone(userId, await this.hasher.hash(password)))) throw new PasswordExistsError();
  }
}
