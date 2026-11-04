import type { CreatePostingInput, RemoteScope } from "@jobradar/shared";

export interface ManualPostingForm {
  /** The pasted posting text: the only required field. */
  text: string;
  title?: string;
  company?: string;
  url?: string;
  location?: string;
  remoteScope?: RemoteScope;
}

export const MISSING_COMPANY = "—";
const MAX_TITLE = 300;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** First non-empty line of the pasted text, cut to the title limit. */
export function guessTitle(text: string): string {
  const line = text.split(/\r?\n/).map((candidate) => candidate.trim()).find(Boolean) ?? "";
  return line.length > MAX_TITLE ? `${line.slice(0, MAX_TITLE - 1)}…` : line;
}

/**
 * Builds the API body from whatever the user filled in. Missing title/company/URL are derived so that
 * pasting only the text works. Without a URL the identity is `manual:<sha-256 of the normalized text>`, so
 * pasting the same text twice is detected as a duplicate (409) instead of creating a copy.
 */
export async function toCreatePosting(form: ManualPostingForm): Promise<CreatePostingInput> {
  const text = form.text.trim();
  if (!text) throw new Error("The posting text is empty");
  const url = form.url?.trim();
  const identity = text.replace(/\s+/g, " ").toLowerCase();
  return {
    title: form.title?.trim() || guessTitle(text),
    company: form.company?.trim() || MISSING_COMPANY,
    url: url || `manual:${await sha256Hex(identity)}`,
    source: "manual",
    location: form.location?.trim() || undefined,
    remoteScope: form.remoteScope ?? "unknown",
    description: text,
  };
}

export function isWebUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
