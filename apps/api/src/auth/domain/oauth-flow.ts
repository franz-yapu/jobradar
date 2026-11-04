export type OAuthIntent = "login" | "link";

/** One Google sign-in attempt in flight. Only the hash of `state` is stored; it can be consumed once. */
export interface OAuthFlow {
  readonly id: string;
  readonly stateHash: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly intent: OAuthIntent;
  /** The logged-in account, for intent "link". */
  readonly userId: string | null;
  /** Local path in the web app to go back to. */
  readonly returnTo: string;
  readonly expiresAt: Date;
}

export const OAUTH_FLOW_TTL_MS = 10 * 60 * 1000;

/** Machine codes the callback puts in `?error=`. Generic on purpose: no provider detail reaches the browser. */
export const GOOGLE_FAILURES = ["google_failed", "google_link_required", "google_taken", "signup_disabled", "too_many_attempts"] as const;
export type GoogleFailure = (typeof GOOGLE_FAILURES)[number];

/** Only a path inside the web app: anything that could leave the site (`//host`, `/\\host`, a scheme) becomes "/". */
export function safeReturnTo(raw: string | undefined): string {
  if (!raw || raw.length > 200) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return "/";
  return raw;
}
