import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useProviders } from "../auth/useProviders";
import { GoogleButton, OrDivider } from "./GoogleButton";
import { Alert } from "./ui";

const CODES = ["google_failed", "google_link_required", "google_taken", "signup_disabled", "too_many_attempts"];

/**
 * The Google part of the login and registration screens: the reason a Google attempt failed (the server
 * redirects here with `?error=<code>`), the button, and an "or" before the password form. Hidden entirely
 * when the server does not offer Google.
 */
export function GoogleSignIn({ returnTo }: { returnTo: string }) {
  const { t } = useTranslation();
  const providers = useProviders();
  const [params] = useSearchParams();
  const error = params.get("error");
  const code = error ? (CODES.includes(error) ? error : "google_failed") : null;
  return (
    <>
      {code ? (
        <div className="mb-4">
          <Alert tone="danger">{t(`auth.google.errors.${code}`)}</Alert>
        </div>
      ) : null}
      {providers.google ? (
        <>
          <GoogleButton returnTo={returnTo} />
          <OrDivider />
        </>
      ) : null}
    </>
  );
}
