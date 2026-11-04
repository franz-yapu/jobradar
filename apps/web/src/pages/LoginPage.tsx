import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { AuthLayout } from "../components/AuthLayout";
import { ErrorMessage } from "../components/ErrorMessage";
import { Button, FIELD, FieldLabel } from "../components/ui";

/** Where to go after logging in: the page that sent us here, if it was a local path. */
export function returnPath(state: unknown): string {
  const from = typeof state === "object" && state !== null ? (state as { from?: unknown }).from : undefined;
  return typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : "/";
}

export function LoginPage() {
  const { t } = useTranslation();
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = useMutation({
    mutationFn: () => login(email.trim(), password),
    onSuccess: () => void navigate(returnPath(state), { replace: true }),
  });

  if (user && !submit.isPending) return <Navigate to={returnPath(state)} replace />;

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    submit.mutate();
  }

  return (
    <AuthLayout title={t("auth.login.title")} subtitle={t("auth.login.subtitle")}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <FieldLabel>{t("auth.email")}</FieldLabel>
          <input
            className={FIELD}
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="block">
          <FieldLabel>{t("auth.password")}</FieldLabel>
          <input
            className={FIELD}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {submit.isError ? <ErrorMessage error={submit.error} /> : null}
        <Button type="submit" className="w-full" disabled={submit.isPending}>
          {submit.isPending ? t("auth.login.submitting") : t("auth.login.submit")}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {t("auth.login.noAccount")}{" "}
        <Link to="/register" state={state} className="font-medium text-primary hover:underline">
          {t("auth.login.register")}
        </Link>
      </p>
    </AuthLayout>
  );
}
