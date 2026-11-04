import { MIN_PASSWORD_LENGTH } from "@jobradar/shared";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { AuthLayout } from "../components/AuthLayout";
import { ErrorMessage } from "../components/ErrorMessage";
import { Alert, Button, FIELD, FieldLabel } from "../components/ui";
import { returnPath } from "./LoginPage";

export function RegisterPage() {
  const { t } = useTranslation();
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () => register(email.trim(), password),
    onSuccess: () => void navigate(returnPath(state), { replace: true }),
  });

  if (user && !submit.isPending) return <Navigate to={returnPath(state)} replace />;

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setProblem(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setProblem(t("auth.register.tooShort", { count: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (password !== confirm) {
      setProblem(t("auth.register.mismatch"));
      return;
    }
    submit.mutate();
  }

  return (
    <AuthLayout title={t("auth.register.title")} subtitle={t("auth.register.subtitle")}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <FieldLabel>{t("auth.email")}</FieldLabel>
          <input
            className={FIELD}
            type="email"
            name="email"
            spellCheck={false}
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="block">
          <FieldLabel hint={t("auth.register.passwordHint", { count: MIN_PASSWORD_LENGTH })}>{t("auth.password")}</FieldLabel>
          <input
            className={FIELD}
            type="password"
            name="new-password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label className="block">
          <FieldLabel>{t("auth.register.confirm")}</FieldLabel>
          <input
            className={FIELD}
            type="password"
            name="confirm-password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>
        {problem ? <Alert tone="danger">{problem}</Alert> : null}
        {submit.isError ? <ErrorMessage error={submit.error} /> : null}
        <Button type="submit" className="w-full" disabled={submit.isPending}>
          {submit.isPending ? t("auth.register.submitting") : t("auth.register.submit")}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {t("auth.register.haveAccount")}{" "}
        <Link to="/login" state={state} className="font-medium text-primary-ink hover:underline">
          {t("auth.register.login")}
        </Link>
      </p>
    </AuthLayout>
  );
}
