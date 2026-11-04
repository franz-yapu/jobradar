import { useTranslation } from "react-i18next";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ErrorMessage } from "../components/ErrorMessage";
import { useAuth } from "./auth-context";

/** Everything inside needs a logged-in account; otherwise go to the login screen and come back afterwards. */
export function RequireAuth() {
  const { t } = useTranslation();
  const { user, loading, error, retry } = useAuth();
  const location = useLocation();

  if (loading) return <p className="p-8 text-center text-muted">{t("postings.loading")}</p>;
  if (error) {
    return (
      <div className="mx-auto max-w-md p-8">
        <ErrorMessage error={error} onRetry={retry} />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}
