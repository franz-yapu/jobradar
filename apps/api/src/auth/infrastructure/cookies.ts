import type { CookieOptions } from "express";

export const SESSION_COOKIE = "jr_session";

/** Reads one cookie from a `Cookie` header without a parsing dependency. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** httpOnly: not readable from JavaScript. SameSite=Lax: not sent on cross-site POSTs. Secure in production. */
export function sessionCookieOptions(production: boolean): CookieOptions {
  return { httpOnly: true, sameSite: "lax", secure: production, path: "/" };
}
