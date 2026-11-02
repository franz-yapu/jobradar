const TRACKING_PARAMS = new Set(["ref", "fbclid", "gclid"]);

export class InvalidUrlError extends Error {
  constructor(url: string) {
    super(`Invalid posting URL: ${url}`);
    this.name = "InvalidUrlError";
  }
}

/**
 * Canonical form used to detect duplicate postings: lowercase host, no fragment,
 * no tracking params (utm_*, ref, fbclid, gclid) and no trailing slash.
 */
export function normalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new InvalidUrlError(raw);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new InvalidUrlError(raw);

  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.protocol}//${url.host}${path}${url.search}`;
}
