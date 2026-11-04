import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { ErrorMessage } from "../components/ErrorMessage";
import { PostingFiltersBar } from "../components/PostingFiltersBar";
import { PostingRow } from "../components/PostingRow";
import { PAGE_SIZE, parseFilters, serializeFilters, sinceToCreatedSince } from "../lib/filters";
import type { PostingFilters } from "../lib/filters";

export function PostingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const filters = parseFilters(params);

  const query = useQuery({
    queryKey: ["postings", filters],
    queryFn: () =>
      api.listPostings({
        verdict: filters.verdict,
        q: filters.q,
        source: filters.source,
        createdSince: sinceToCreatedSince(filters.since, new Date()),
        page: filters.page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: (previous) => previous,
  });

  const score = useMutation({
    mutationFn: (postingId: string) => api.scorePosting(postingId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["postings"] }),
  });

  const change = (next: PostingFilters) => setParams(serializeFilters(next));
  const pages = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.pageSize)) : 1;

  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold">{t("postings.title")}</h2>
      <PostingFiltersBar key={filters.q} filters={filters} onChange={change} />
      {query.isPending ? <p>{t("postings.loading")}</p> : null}
      {query.isError ? <ErrorMessage error={query.error} onRetry={() => void query.refetch()} /> : null}
      {query.data ? (
        query.data.items.length === 0 ? (
          <p>{filters.verdict || filters.q || filters.source || filters.since !== "all" ? t("postings.noMatches") : t("postings.empty")}</p>
        ) : (
          <>
            <p className="mb-2 text-sm text-slate-500">{t("postings.total", { count: query.data.total })}</p>
            <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
              {query.data.items.map((posting) => (
                <PostingRow
                  key={posting.id}
                  posting={posting}
                  scoring={score.isPending && score.variables === posting.id}
                  scoreError={score.isError && score.variables === posting.id ? score.error : null}
                  onScore={(postingId) => score.mutate(postingId)}
                />
              ))}
            </ul>
            <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-3 py-1 disabled:opacity-40"
                disabled={filters.page <= 1}
                onClick={() => change({ ...filters, page: filters.page - 1 })}
              >
                {t("postings.previous")}
              </button>
              <span>{t("postings.page", { page: filters.page, pages })}</span>
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-3 py-1 disabled:opacity-40"
                disabled={filters.page >= pages}
                onClick={() => change({ ...filters, page: filters.page + 1 })}
              >
                {t("postings.next")}
              </button>
            </nav>
          </>
        )
      ) : null}
    </section>
  );
}
