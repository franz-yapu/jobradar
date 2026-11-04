import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { buttonClass } from "./ui";

/** Google's "G" mark, in its brand colours (the one place the green palette gives way to a partner's logo). */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.2C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.2z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/** A real link, not a button: the Google round trip is a browser navigation that starts on the server. */
export function GoogleButton({ returnTo, mode = "signin" }: { returnTo?: string; mode?: "signin" | "link" }) {
  const { t } = useTranslation();
  const href = mode === "link" ? api.googleLinkUrl(returnTo) : api.googleSignInUrl(returnTo);
  return (
    <a href={href} className={buttonClass("outline", "md", "w-full")}>
      <GoogleMark />
      {mode === "link" ? t("account.google.connect") : t("auth.google.continue")}
    </a>
  );
}

/** "or" between the Google button and the password form. */
export function OrDivider() {
  const { t } = useTranslation();
  return (
    <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-muted" role="separator">
      <span className="h-px flex-1 bg-line" />
      {t("auth.google.or")}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
