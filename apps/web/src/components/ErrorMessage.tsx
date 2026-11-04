import { useTranslation } from "react-i18next";
import { ApiError, ContractError } from "../api/client";

/** Maps any error to a translated, human message. */
export function errorKey(error: unknown): string {
  if (error instanceof ApiError && error.code === "network_error") return "errors.network_error";
  if (error instanceof ContractError) return "errors.contract";
  return "errors.generic";
}

export function ErrorMessage({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <p>{t(errorKey(error))}</p>
      {onRetry ? (
        <button type="button" className="mt-2 underline" onClick={onRetry}>
          {t("errors.retry")}
        </button>
      ) : null}
    </div>
  );
}
