import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** Estrutura padrão das páginas de gestão. */
export function PageShell({ title, description, back = "/gestao", actions, children, wide = false }: { title: string; description?: string; back?: string | null; actions?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto w-full ${wide ? "max-w-5xl" : "max-w-3xl"} px-4 pt-5 pb-12 sm:px-6 sm:pt-8`}>
      {back && (
        <Link href={back} className="mb-3 inline-flex h-9 items-center gap-1.5 rounded-full pr-3 text-sm text-muted transition hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden /> Gestão
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="mt-6 space-y-5">{children}</div>
    </div>
  );
}

export function Card({ children, className = "", title, aside }: { children: React.ReactNode; className?: string; title?: string; aside?: React.ReactNode }) {
  return (
    <section className={`rounded-[28px] border border-line bg-surface p-5 ${className}`}>
      {(title || aside) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: string; hint?: string; tone?: "default" | "good" | "bad" }) {
  return (
    <div className="min-w-0 rounded-3xl bg-surface-2/70 p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold tracking-tight break-words tabular-nums sm:text-2xl ${tone === "good" ? "text-leaf" : tone === "bad" ? "text-danger" : ""}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-subtle">{hint}</p>}
    </div>
  );
}

const BADGE = {
  ok: "bg-brand-soft text-brand",
  warn: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  muted: "bg-surface-2 text-muted",
} as const;

export function Badge({ tone = "muted", children }: { tone?: keyof typeof BADGE; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[tone]}`}>{children}</span>;
}

export function EmptyState({ icon, title, text }: { icon?: React.ReactNode; title: string; text?: string }) {
  return (
    <div className="rounded-[28px] border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-surface-2 text-subtle">{icon}</div>}
      <p className="font-medium">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{text}</p>}
    </div>
  );
}

/** Aviso informativo (limitações, metodologia). */
export function Note({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) {
  return <p className={`rounded-3xl px-4 py-3 text-sm leading-relaxed ${tone === "warn" ? "bg-warning-soft text-warning" : "bg-info-soft text-info"}`}>{children}</p>;
}

/** Seletor de safra por links (?safra=id), sem JavaScript. */
export function SeasonTabs({ seasons, current, basePath, allLabel }: { seasons: { id: string; name: string }[]; current: string | null; basePath: string; allLabel?: string }) {
  // current === null só é "Todas" quando allLabel existe; link usa ?safra=todas
  if (!seasons.length) return null;
  return (
    <div className="-mx-4 overflow-x-auto px-4 scrollbar-thin sm:mx-0 sm:px-0" role="tablist" aria-label="Safra">
      <div className="flex w-max gap-2 pb-1">
        {allLabel && (
          <Link href={`${basePath}?safra=todas`} role="tab" aria-selected={current === null} className={`inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap transition ${current === null ? "border-brand bg-brand text-brand-fg" : "border-line bg-surface hover:border-brand/40"}`}>
            {allLabel}
          </Link>
        )}
        {seasons.map((s) => (
          <Link key={s.id} href={`${basePath}?safra=${s.id}`} role="tab" aria-selected={current === s.id} className={`inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap transition ${current === s.id ? "border-brand bg-brand text-brand-fg" : "border-line bg-surface hover:border-brand/40"}`}>
            {s.name}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ListRow({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 px-4 py-3">
      <div className="min-w-0 flex-1">{children}</div>
      {actions && <div className="flex shrink-0 items-center">{actions}</div>}
    </li>
  );
}

export function List({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-line overflow-hidden rounded-[28px] border border-line bg-surface">{children}</ul>;
}
