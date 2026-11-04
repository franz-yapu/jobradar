import { VERDICT_FILTERS } from "@jobradar/shared";

export type VerdictFilter = (typeof VERDICT_FILTERS)[number];
export const SINCE_OPTIONS = ["all", "24h", "7d"] as const;
export type SinceOption = (typeof SINCE_OPTIONS)[number];
export const SOURCE_OPTIONS = ["getonboard", "manual"] as const;
export const PAGE_SIZE = 25;

export interface PostingFilters {
  verdict?: VerdictFilter;
  q: string;
  source: string;
  since: SinceOption;
  page: number;
}

const HOURS: Record<Exclude<SinceOption, "all">, number> = { "24h": 24, "7d": 24 * 7 };

/** Filters live in the URL so a view can be shared and survives a reload. Unknown values are ignored. */
export function parseFilters(params: URLSearchParams): PostingFilters {
  const verdict = params.get("verdict");
  const since = params.get("since");
  const page = Number.parseInt(params.get("page") ?? "", 10);
  return {
    verdict: (VERDICT_FILTERS as readonly string[]).includes(verdict ?? "") ? (verdict as VerdictFilter) : undefined,
    q: params.get("q")?.trim() ?? "",
    source: params.get("source")?.trim() ?? "",
    since: (SINCE_OPTIONS as readonly string[]).includes(since ?? "") ? (since as SinceOption) : "all",
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** Only non-default values are written, so the default view has a clean URL. */
export function serializeFilters(filters: PostingFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.verdict) params.set("verdict", filters.verdict);
  if (filters.q) params.set("q", filters.q);
  if (filters.source) params.set("source", filters.source);
  if (filters.since !== "all") params.set("since", filters.since);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params;
}

export function sinceToCreatedSince(since: SinceOption, now: Date): string | undefined {
  if (since === "all") return undefined;
  return new Date(now.getTime() - HOURS[since] * 3_600_000).toISOString();
}
