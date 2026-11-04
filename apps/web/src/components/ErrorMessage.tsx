import { useTranslation } from "react-i18next";
import { ApiError, ContractError } from "../api/client";
import { Alert, Button } from "./ui";

const KNOWN_CODES = new Set(["ai_budget_exceeded", "ai_not_configured", "profile_not_configured", "ai_refused", "ai_provider_error"]);

/** Maps any error to a translated, human message. */
export function errorKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "network_error") return "errors.network_error";
    if (error.status === 404) return "errors.not_found";
    if (KNOWN_CODES.has(error.code)) return `errors.${error.code}`;
  }
  if (error instanceof ContractError) return "errors.contract";
  return "errors.generic";
}

export function ErrorMessage({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <Alert tone="danger">
      <p>{t(errorKey(error))}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          {t("errors.retry")}
        </Button>
      ) : null}
    </Alert>
  );
}
