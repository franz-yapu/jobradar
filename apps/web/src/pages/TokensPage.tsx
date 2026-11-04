import { MAX_API_TOKEN_NAME_LENGTH } from "@jobradar/shared";
import type { ApiTokenResponse, CreatedApiTokenResponse } from "@jobradar/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { ErrorMessage } from "../components/ErrorMessage";
import { Alert, Button, Card, FIELD, FieldLabel } from "../components/ui";

const TOKENS_KEY = ["api-tokens"] as const;

function TokenRow({ token, onRevoked }: { token: ApiTokenResponse; onRevoked: () => void }) {
  const { t, i18n } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const revoke = useMutation({ mutationFn: () => api.revokeApiToken(token.id), onSuccess: onRevoked });
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium", timeStyle: "short" });
  const revoked = token.revokedAt !== null;

  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between" data-testid="token-row">
      <div className="min-w-0">
        <p className="font-semibold">{token.name}</p>
        <p className="text-sm text-muted">
          <code>{token.prefix}…</code> · {t("tokens.created", { date: date.format(new Date(token.createdAt)) })} ·{" "}
          {token.lastUsedAt ? t("tokens.lastUsed", { date: date.format(new Date(token.lastUsedAt)) }) : t("tokens.neverUsed")}
        </p>
        {revoke.isError ? (
          <div className="mt-2">
            <ErrorMessage error={revoke.error} />
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`rounded-md px-2.5 py-1 text-xs font-semibold ${revoked ? "bg-line text-muted" : "bg-success-soft text-success-ink"}`}
        >
          {revoked ? t("tokens.revoked") : t("tokens.active")}
        </span>
        {revoked ? null : confirming ? (
          <>
            <Button variant="danger" size="sm" disabled={revoke.isPending} onClick={() => revoke.mutate()}>
              {t("tokens.confirmRevoke")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              {t("tokens.cancel")}
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" aria-label={t("tokens.revokeNamed", { name: token.name })} onClick={() => setConfirming(true)}>
            {t("tokens.revoke")}
          </Button>
        )}
      </div>
    </li>
  );
}

/** The secret is shown once, right after creating the token, and is kept only in this component's state. */
function NewSecret({ created, onDone }: { created: CreatedApiTokenResponse; onDone: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(created.token);
      setCopied(true);
    } catch {
      setCopied(false); // clipboard blocked: the token is selectable text, the user can copy it by hand
    }
  }

  return (
    <Alert tone="warning" role="status">
      <p className="font-medium">{t("tokens.secretTitle", { name: created.name })}</p>
      <p className="mt-1">{t("tokens.secretWarning")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="select-all break-all rounded-lg bg-card px-3 py-2 text-sm text-ink" data-testid="new-token">
          {created.token}
        </code>
        <Button variant="outline" size="sm" onClick={() => void copy()}>
          {copied ? t("tokens.copied") : t("tokens.copy")}
        </Button>
      </div>
      <p className="mt-3">
        {t("tokens.useIt")} <code>JOBRADAR_API_TOKEN={"<token>"}</code>
      </p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onDone}>
        {t("tokens.saved")}
      </Button>
    </Alert>
  );
}

export function TokensPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState("n8n");
  const [created, setCreated] = useState<CreatedApiTokenResponse | null>(null);

  const list = useQuery({ queryKey: TOKENS_KEY, queryFn: () => api.listApiTokens() });
  const create = useMutation({
    mutationFn: () => api.createApiToken(name.trim()),
    onSuccess: (token) => {
      setCreated(token);
      void queryClient.invalidateQueries({ queryKey: TOKENS_KEY });
    },
  });

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (name.trim()) create.mutate();
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">{t("tokens.title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("tokens.intro")}</p>
      </div>

      <Card title={t("tokens.createTitle")}>
        <form className="flex flex-wrap items-end gap-3" onSubmit={onSubmit}>
          <label className="min-w-56 flex-1">
            <FieldLabel>{t("tokens.name")}</FieldLabel>
            <input
              className={FIELD}
              value={name}
              maxLength={MAX_API_TOKEN_NAME_LENGTH}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <Button type="submit" disabled={create.isPending || !name.trim()}>
            {create.isPending ? t("tokens.creating") : t("tokens.create")}
          </Button>
        </form>
        {create.isError ? (
          <div className="mt-4">
            <ErrorMessage error={create.error} />
          </div>
        ) : null}
      </Card>

      {created ? <NewSecret created={created} onDone={() => setCreated(null)} /> : null}

      {list.isPending ? <p className="text-muted">{t("postings.loading")}</p> : null}
      {list.isError ? <ErrorMessage error={list.error} onRetry={() => void list.refetch()} /> : null}
      {list.data ? (
        list.data.length === 0 ? (
          <Card>
            <p className="text-center text-muted">{t("tokens.empty")}</p>
          </Card>
        ) : (
          <Card className="overflow-hidden [&>div]:p-0">
            <ul className="divide-y divide-line">
              {list.data.map((token) => (
                <TokenRow key={token.id} token={token} onRevoked={() => void queryClient.invalidateQueries({ queryKey: TOKENS_KEY })} />
              ))}
            </ul>
          </Card>
        )
      ) : null}
    </div>
  );
}
