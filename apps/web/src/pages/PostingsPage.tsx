import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { ErrorMessage } from "../components/ErrorMessage";
import { PlusIcon } from "../components/icons";
import { PostingFiltersBar } from "../components/PostingFiltersBar";
import { PostingRow } from "../components/PostingRow";
import { Button, buttonClass, Card } from "../components/ui";
import { PAGE_SIZE, parseFilters, serializeFilters, sinceToCreatedSince } from "../lib/filters";
import type { PostingFilters } from "../lib/filters";

export function PostingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const filters = parseFilters(params);
  const filtered = Boolean(filters.verdict || filters.q || filters.source || filters.since !== "all");

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
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("postings.title")}</h1>
          <p className="mt-1 text-sm text-muted">{query.data ? t("postings.total", { count: query.data.total }) : t("app.tagline")}</p>
        </div>
        <Link to="/postings/new" className={buttonClass()}>
          <PlusIcon width={16} height={16} />
          {t("postings.paste")}
        </Link>
      </div>

      <Card>
        <PostingFiltersBar key={filters.q} filters={filters} onChange={change} />
      </Card>

      {query.isPending ? <p className="text-muted">{t("postings.loading")}</p> : null}
      {query.isError ? <ErrorMessage error={query.error} onRetry={() => void query.refetch()} /> : null}
      {query.data ? (
        query.data.items.length === 0 ? (
          <Card>
            <p className="text-center text-muted">{filtered ? t("postings.noMatches") : t("postings.empty")}</p>
          </Card>
        ) : (
          <>
            <Card className="overflow-hidden [&>div]:p-0">
              <ul className="divide-y divide-line">
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
            </Card>
            <nav className="flex items-center justify-between text-sm" aria-label={t("postings.pagination")}>
              <Button variant="outline" disabled={filters.page <= 1} onClick={() => change({ ...filters, page: filters.page - 1 })}>
                {t("postings.previous")}
              </Button>
              <span className="text-muted">{t("postings.page", { page: filters.page, pages })}</span>
              <Button variant="outline" disabled={filters.page >= pages} onClick={() => change({ ...filters, page: filters.page + 1 })}>
                {t("postings.next")}
              </Button>
            </nav>
          </>
        )
      ) : null}
    </div>
  );
}
