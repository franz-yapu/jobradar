import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { ErrorMessage } from "../components/ErrorMessage";
import { ListIcon, PlusIcon } from "../components/icons";
import { PostingFiltersBar } from "../components/PostingFiltersBar";
import { PostingRow } from "../components/PostingRow";
import { Alert, Button, buttonClass, Card, PageHeader } from "../components/ui";
import { PAGE_SIZE, parseFilters, serializeFilters, sinceToCreatedSince } from "../lib/filters";
import type { PostingFilters } from "../lib/filters";

const NEWEST_BATCH = 10;

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

  // Scoring needs a profile. Without one the list is still shown (the catalog is shared) and the page asks for it.
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => api.getProfile() });
  const profileReady = Boolean(profile.data);
  const needsProfile = profile.isSuccess && profile.data === null;

  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const [batchResult, setBatchResult] = useState<number | null>(null);
  const scoreNewest = useMutation({
    mutationFn: async () => {
      const unscored = await api.listPostings({ verdict: "unscored", page: 1, pageSize: NEWEST_BATCH });
      let done = 0;
      setBatchResult(null);
      setBatch({ done, total: unscored.items.length });
      try {
        for (const posting of unscored.items) {
          await api.scorePosting(posting.id);
          done += 1;
          setBatch({ done, total: unscored.items.length });
        }
      } finally {
        setBatchResult(done);
        setBatch(null);
        await queryClient.invalidateQueries({ queryKey: ["postings"] });
      }
      return done;
    },
  });

  const score = useMutation({
    mutationFn: (postingId: string) => api.scorePosting(postingId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["postings"] }),
  });

  const change = (next: PostingFilters) => setParams(serializeFilters(next));
  const pages = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.pageSize)) : 1;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<ListIcon />}
        title={t("postings.title")}
        description={query.data ? t("postings.total", { count: query.data.total }) : t("app.tagline")}
        actions={
          <Link to="/postings/new" className={buttonClass()}>
            <PlusIcon width={16} height={16} />
            {t("postings.paste")}
          </Link>
        }
      />

      {needsProfile ? (
        <Alert tone="info" role="status">
          <p className="font-medium">{t("postings.profileBanner")}</p>
          <p className="mt-1">{t("postings.profileBannerHint")}</p>
          <Link to="/profile" className={buttonClass("primary", "sm", "mt-3")}>
            {t("postings.profileButton")}
          </Link>
        </Alert>
      ) : null}

      {profileReady ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => scoreNewest.mutate()} disabled={scoreNewest.isPending} title={t("postings.scoreNewestHint")}>
            {batch ? t("postings.scoringProgress", { done: batch.done, total: batch.total }) : t("postings.scoreNewest")}
          </Button>
          {batchResult !== null && !scoreNewest.isPending && !scoreNewest.isError ? (
            <span role="status" className="text-sm text-muted">
              {batchResult > 0 ? t("postings.scoredCount", { count: batchResult }) : t("postings.nothingToScore")}
            </span>
          ) : null}
        </div>
      ) : null}
      {scoreNewest.isError ? <ErrorMessage error={scoreNewest.error} /> : null}

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
              <ul className="stagger divide-y divide-line">
                {query.data.items.map((posting) => (
                  <PostingRow
                    key={posting.id}
                    posting={posting}
                    scoring={score.isPending && score.variables === posting.id}
                    profileReady={profileReady || profile.isPending}
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
