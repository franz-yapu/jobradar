import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Shared look of the app: cards, buttons and form controls. Keep visual decisions here, not in pages. */

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rise rounded-xl border border-line bg-card shadow-[0_1px_2px_rgb(20_40_28/6%)] ${className}`}>
      {title || actions ? (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
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
  primary: "bg-gradient-to-b from-primary to-primary-hover text-on-primary border-transparent shadow-sm hover:brightness-110 active:scale-[0.98]",
  outline: "bg-card text-ink border-line-strong hover:border-primary hover:bg-raised active:scale-[0.98]",
  ghost: "bg-transparent text-muted border-transparent hover:bg-raised hover:text-ink",
  danger: "bg-danger text-on-danger border-transparent hover:opacity-90",
};

/** Button look for any element, e.g. a router `Link` that must not contain a nested `<button>`. */
export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" = "md", extra = ""): string {
  const sizing = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";
  return `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-medium transition duration-150 disabled:cursor-not-allowed disabled:border-line-strong disabled:bg-raised disabled:text-muted ${sizing} ${VARIANTS[variant]} ${extra}`.trim();
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
  "w-full rounded-lg border border-line-strong bg-card px-3 py-2.5 text-sm text-ink transition placeholder:text-muted hover:border-primary/60 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15";

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
    <div role={role} className={`rise rounded-lg border-l-4 border-current px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

/** Page title block: a coloured icon tile, the title and a one-line description, with optional actions on the right. */
export function PageHeader({ icon, title, description, actions }: { icon: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="rise flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-gradient-to-r from-primary-soft via-card to-accent-soft p-5">
      <div className="flex items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary shadow-sm">{icon}</span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
        </div>
      </div>
      {actions}
    </div>
  );
}
