/** Accepts `bo`, `BO`, `LatAm`, `Worldwide`; returns the canonical form or null. */
export function normalizeLocation(raw: string): string | null {
  const value = raw.trim();
  if (/^[a-z]{2}$/i.test(value)) return value.toUpperCase();
  const keyword = value.toLowerCase();
  return keyword === "latam" || keyword === "worldwide" ? keyword : null;
}
