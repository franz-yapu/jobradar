import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import type { JWTVerifyGetKey } from "jose";
import { z } from "zod";
import { IdentityVerificationError, type IdentityProvider, type VerifiedIdentity } from "../domain/identity-provider.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const TIMEOUT_MS = 10_000;

const TokenResponse = z.object({ id_token: z.string().min(1) });

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface Dependencies {
  /** Replaced in tests. */
  fetch?: typeof fetch;
  /** Key source for the id_token signature; Google's published keys by default. */
  keys?: JWTVerifyGetKey;
  now?: () => Date;
}

/**
 * Google as an OpenID Connect provider (authorization code + PKCE). The id_token is verified here, not trusted:
 * signature (RS256 only), issuer, audience, expiry, nonce, a present `sub` and `email_verified === true`.
 */
export class GoogleIdentityProvider implements IdentityProvider {
  private readonly fetcher: typeof fetch;
  private readonly keys: JWTVerifyGetKey;
  private readonly now: () => Date;

  constructor(
    private readonly config: GoogleConfig,
    dependencies: Dependencies = {},
  ) {
    this.fetcher = dependencies.fetch ?? fetch;
    this.keys = dependencies.keys ?? createRemoteJWKSet(new URL(JWKS_URL));
    this.now = dependencies.now ?? (() => new Date());
  }

  authorizationUrl(input: { state: string; nonce: string; codeChallenge: string }): string {
    const url = new URL(AUTH_URL);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: "openid email",
      state: input.state,
      nonce: input.nonce,
      code_challenge: input.codeChallenge,
      code_challenge_method: "S256",
    }).toString();
    return url.toString();
  }

  async verifyCallback(input: { code: string; codeVerifier: string; nonce: string }): Promise<VerifiedIdentity> {
    const idToken = await this.exchange(input.code, input.codeVerifier);
    try {
      const { payload } = await jwtVerify(idToken, this.keys, {
        algorithms: ["RS256"],
        issuer: ISSUERS,
        audience: this.config.clientId,
        currentDate: this.now(),
        clockTolerance: 30,
        requiredClaims: ["exp", "iat", "sub"],
      });
      if (payload["nonce"] !== input.nonce) throw new IdentityVerificationError("nonce mismatch");
      if (typeof payload.sub !== "string" || payload.sub.length === 0) throw new IdentityVerificationError("missing sub");
      const email = payload["email"];
      if (typeof email !== "string" || email.length === 0) throw new IdentityVerificationError("missing email");
      if (payload["email_verified"] !== true) throw new IdentityVerificationError("email not verified");
      return { sub: payload.sub, email: email.trim().toLowerCase() };
    } catch (error) {
      if (error instanceof IdentityVerificationError) throw error;
      const reason = error instanceof errors.JOSEError ? error.code : "unknown";
      throw new IdentityVerificationError(`id_token rejected (${reason})`, { cause: error });
    }
  }

  /** Server-to-server code exchange; the client secret and the PKCE verifier never reach the browser. */
  private async exchange(code: string, codeVerifier: string): Promise<string> {
    let response: Response;
    try {
      response = await this.fetcher(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          code_verifier: codeVerifier,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: this.config.redirectUri,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new IdentityVerificationError("token endpoint unreachable", { cause: error });
    }
    if (!response.ok) throw new IdentityVerificationError(`token endpoint answered ${response.status}`);
    const parsed = TokenResponse.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new IdentityVerificationError("token endpoint answered without an id_token");
    return parsed.data.id_token;
  }
}
