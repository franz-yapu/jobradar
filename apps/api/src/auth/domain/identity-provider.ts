export const IDENTITY_PROVIDER = Symbol("IDENTITY_PROVIDER");

/** What a provider vouches for. Accounts are keyed by `sub`; the email is only ever shown and used to detect clashes. */
export interface VerifiedIdentity {
  /** The provider's stable id for the person. */
  readonly sub: string;
  /** Lowercase. Only returned when the provider verified it. */
  readonly email: string;
}

/**
 * An OpenID Connect provider (Google today, ADR-0003). The use cases never see tokens or URLs of the
 * provider: they hand over the authorization-code material and get back a verified identity or an error.
 */
export interface IdentityProvider {
  /** Where to send the browser to sign in. */
  authorizationUrl(input: { state: string; nonce: string; codeChallenge: string }): string;
  /** Exchanges the code and verifies the answer. Throws IdentityVerificationError for anything wrong. */
  verifyCallback(input: { code: string; codeVerifier: string; nonce: string }): Promise<VerifiedIdentity>;
}

/** Any failure of the provider flow. The message is for logs; users only ever see a generic code. */
export class IdentityVerificationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "IdentityVerificationError";
  }
}
