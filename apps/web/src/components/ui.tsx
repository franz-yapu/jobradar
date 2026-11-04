import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Shared look of the app: cards, buttons and form controls. Keep visual decisions here, not in pages. */

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-line bg-card ${className}`}>
      {title || actions ? (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          {title ? <h2 className="text-base font-semibold text-ink">{title}</h2> : <span />}
          {actions}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

type ButtonVariant = "primary" | "outline" | "ghost" | "danger";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover border-transparent",
  outline: "bg-card text-ink border-line-strong hover:bg-raised",
  ghost: "bg-transparent text-muted border-transparent hover:bg-raised hover:text-ink",
  danger: "bg-danger text-on-danger border-transparent hover:opacity-90",
};

/** Button look for any element, e.g. a router `Link` that must not contain a nested `<button>`. */
export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" = "md", extra = ""): string {
  const sizing = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";
  return `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border font-medium transition-colors disabled:cursor-not-allowed disabled:border-line-strong disabled:bg-raised disabled:text-muted ${sizing} ${VARIANTS[variant]} ${extra}`.trim();
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

/** Classes for inputs, selects and textareas. */
export const FIELD =
  "w-full rounded-md border border-line-strong bg-card px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary";

export function FieldLabel({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="mb-1.5 flex items-baseline gap-1 text-sm font-medium text-ink">
      {children}
      {hint ? <span className="text-xs font-normal text-muted">({hint})</span> : null}
    </span>
  );
}

export function Alert({ tone, children, role = "alert" }: { tone: "danger" | "warning" | "success" | "info"; children: ReactNode; role?: "alert" | "status" | "note" }) {
  const tones = {
    danger: "bg-danger-soft text-danger-ink",
    warning: "bg-warning-soft text-warning-ink",
    success: "bg-success-soft text-success-ink",
    info: "bg-primary-soft text-primary-ink",
  } as const;
  return (
    <div role={role} className={`rounded-md px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}
