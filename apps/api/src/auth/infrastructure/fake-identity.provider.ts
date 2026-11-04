import { IdentityVerificationError, type IdentityProvider, type VerifiedIdentity } from "../domain/identity-provider.js";

/** A scripted provider for tests: no network, no tokens. It records what the use cases handed over. */
export class FakeIdentityProvider implements IdentityProvider {
  readonly authorizations: { state: string; nonce: string; codeChallenge: string }[] = [];
  readonly verifications: { code: string; codeVerifier: string; nonce: string }[] = [];
  private next: VerifiedIdentity | Error = new IdentityVerificationError("nothing scripted");

  willVerify(identity: VerifiedIdentity): this {
    this.next = identity;
    return this;
  }

  willFail(message = "rejected"): this {
    this.next = new IdentityVerificationError(message);
    return this;
  }

  authorizationUrl(input: { state: string; nonce: string; codeChallenge: string }): string {
    this.authorizations.push(input);
    return `https://accounts.example.test/auth?state=${encodeURIComponent(input.state)}&code_challenge=${encodeURIComponent(input.codeChallenge)}`;
  }

  async verifyCallback(input: { code: string; codeVerifier: string; nonce: string }): Promise<VerifiedIdentity> {
    this.verifications.push(input);
    if (this.next instanceof Error) throw this.next;
    return this.next;
  }
}
