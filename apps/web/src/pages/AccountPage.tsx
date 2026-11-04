import { MIN_PASSWORD_LENGTH } from "@jobradar/shared";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/auth-context";
import { useProviders } from "../auth/useProviders";
import { ErrorMessage } from "../components/ErrorMessage";
import { GoogleButton } from "../components/GoogleButton";
import { ShieldIcon } from "../components/icons";
import { Alert, Button, Card, FIELD, FieldLabel, PageHeader } from "../components/ui";

const ACCOUNT_PATH = "/settings/account";

function Badge({ tone, children }: { tone: "success" | "neutral"; children: string }) {
  const style = tone === "success" ? "bg-success-soft text-success-ink" : "bg-neutral-soft text-neutral-ink";
  return <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${style}`}>{children}</span>;
}

function Row({ title, status, children }: { title: string; status: React.ReactNode; children?: React.ReactNode }) {
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {status}
      </div>
      {children ? <div className="mt-3 text-sm text-muted">{children}</div> : null}
    </li>
  );
}

function SetPasswordForm({ onDone }: { onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const save = useMutation({ mutationFn: () => api.setPassword(password), onSuccess: onDone });

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    setProblem(null);
    if (password.length < MIN_PASSWORD_LENGTH) return setProblem(t("auth.register.tooShort", { count: MIN_PASSWORD_LENGTH }));
    if (password !== confirm) return setProblem(t("auth.register.mismatch"));
    save.mutate();
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      <p>{t("account.password.intro")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <FieldLabel>{t("auth.password")}</FieldLabel>
          <input className={FIELD} type="password" name="new-password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <label className="block">
          <FieldLabel>{t("auth.register.confirm")}</FieldLabel>
          <input className={FIELD} type="password" name="confirm-password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
        </label>
      </div>
      {problem ? <Alert tone="danger">{problem}</Alert> : null}
      {save.isError ? <ErrorMessage error={save.error} /> : null}
      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? t("account.password.saving") : t("account.password.save")}
      </Button>
    </form>
  );
}

/** How this account signs in: email, password, Google. Connect or disconnect Google, add a first password. */
export function AccountPage() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const providers = useProviders();
  const [params, setParams] = useSearchParams();
  const [confirming, setConfirming] = useState(false);
  const disconnect = useMutation({
    mutationFn: () => api.disconnectGoogle(),
    onSuccess: async () => {
      setConfirming(false);
      await refreshUser();
    },
  });

  if (!user) return null;
  const error = params.get("error");
  const linked = params.get("linked") === "1";
  const dismiss = () => setParams({}, { replace: true });
  const errorKey = error && ["google_failed", "google_taken", "too_many_attempts"].includes(error) ? error : error ? "google_failed" : null;

  return (
    <div className="space-y-5">
      <PageHeader icon={<ShieldIcon />} title={t("account.title")} description={t("account.intro")} />

      {errorKey ? (
        <Alert tone="danger">
          <p>{t(`auth.google.errors.${errorKey}`)}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={dismiss}>
            {t("account.dismiss")}
          </Button>
        </Alert>
      ) : null}
      {linked ? (
        <Alert tone="success" role="status">
          {t("account.google.linked")}
        </Alert>
      ) : null}

      <Card title={t("account.methods")} className="overflow-hidden [&>div]:p-0">
        <ul className="divide-y divide-line">
          <Row
            title={t("auth.email")}
            status={<Badge tone={user.emailVerified ? "success" : "neutral"}>{user.emailVerified ? t("account.verified") : t("account.unverified")}</Badge>}
          >
            <span translate="no" className="text-ink">
              {user.email}
            </span>
          </Row>

          <Row title={t("auth.password")} status={<Badge tone={user.hasPassword ? "success" : "neutral"}>{user.hasPassword ? t("account.password.set") : t("account.password.notSet")}</Badge>}>
            {user.hasPassword ? t("account.password.hasOne") : <SetPasswordForm onDone={refreshUser} />}
          </Row>

          {providers.google || user.googleLinked ? (
            <Row title="Google" status={<Badge tone={user.googleLinked ? "success" : "neutral"}>{user.googleLinked ? t("account.google.connected") : t("account.google.notConnected")}</Badge>}>
              {user.googleLinked ? (
                <div className="space-y-3">
                  <p>{user.hasPassword ? t("account.google.connectedText") : t("account.google.needPassword")}</p>
                  {disconnect.isError ? <ErrorMessage error={disconnect.error} /> : null}
                  {user.hasPassword ? (
                    confirming ? (
                      <div className="flex items-center gap-2">
                        <Button variant="danger" size="sm" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>
                          {t("account.google.confirmDisconnect")}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                          {t("tokens.cancel")}
                        </Button>
                      </div>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
                        {t("account.google.disconnect")}
                      </Button>
                    )
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3">
                  <p>{t("account.google.connectText")}</p>
                  <div className="max-w-xs">
                    <GoogleButton mode="link" returnTo={`${ACCOUNT_PATH}?linked=1`} />
                  </div>
                </div>
              )}
            </Row>
          ) : null}
        </ul>
      </Card>
    </div>
  );
}
