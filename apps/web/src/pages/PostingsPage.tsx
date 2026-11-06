import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { ErrorMessage, errorCodeKey } from "../components/ErrorMessage";
import { ListIcon, PlusIcon } from "../components/icons";
import { PostingFiltersBar } from "../components/PostingFiltersBar";
import { PostingRow } from "../components/PostingRow";
import { Alert, Button, buttonClass, Card, PageHeader } from "../components/ui";
import { PAGE_SIZE, parseFilters, serializeFilters, sinceToCreatedSince } from "../lib/filters";
import type { PostingFilters } from "../lib/filters";

const NEWEST_BATCH = 10;
const POLL_MS = 1500;

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

  // "Score the newest jobs" queues a batch on the API and follows it until nothing is left in the queue.
  const [batchId, setBatchId] = useState<string | null>(null);
  const [nothingQueued, setNothingQueued] = useState(false);
  const scoreNewest = useMutation({
    mutationFn: () => api.startScoringBatch(NEWEST_BATCH),
    onMutate: () => {
      setBatchId(null);
      setNothingQueued(false);
    },
    onSuccess: ({ id }) => {
      setBatchId(id);
      setNothingQueued(id === null);
    },
  });
  const batch = useQuery({
    queryKey: ["scoring-batch", batchId],
    queryFn: () => api.getScoringBatch(batchId ?? ""),
    enabled: batchId !== null,
    refetchInterval: (q) => (q.state.data && q.state.data.queued === 0 ? false : POLL_MS),
  });
  const finished = (batch.data?.done ?? 0) + (batch.data?.failed ?? 0);
  // New verdicts show up in the list as they arrive.
  useEffect(() => {
    if (finished > 0) void queryClient.invalidateQueries({ queryKey: ["postings"] });
  }, [finished, queryClient]);
  const running = scoreNewest.isPending || (batchId !== null && (batch.data === undefined ? batch.isPending : batch.data.queued > 0));
  const firstFailure = batch.data?.errors[0];

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
          <Button variant="outline" onClick={() => scoreNewest.mutate()} disabled={running} title={t("postings.scoreNewestHint")}>
            {running && batch.data ? t("postings.scoringProgress", { done: finished, total: batch.data.requested }) : t("postings.scoreNewest")}
          </Button>
          {!running && batch.data ? (
            <span role="status" className="text-sm text-muted">
              {t("postings.scoredCount", { count: batch.data.done })}
            </span>
          ) : null}
          {nothingQueued && !scoreNewest.isPending ? (
            <span role="status" className="text-sm text-muted">
              {t("postings.nothingToScore")}
            </span>
          ) : null}
        </div>
      ) : null}
      {scoreNewest.isError ? <ErrorMessage error={scoreNewest.error} /> : null}
      {batch.isError ? <ErrorMessage error={batch.error} onRetry={() => void batch.refetch()} /> : null}
      {!running && firstFailure ? (
        <Alert tone="danger">
          <p>{t("postings.batchFailed", { count: batch.data?.failed ?? 0 })}</p>
          <p className="mt-1">{t(errorCodeKey(firstFailure.code))}</p>
        </Alert>
      ) : null}

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
