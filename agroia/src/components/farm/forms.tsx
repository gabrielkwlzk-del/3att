"use client";

import { createContext, useActionState, useContext, useEffect, useRef, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Check, ChevronDown, Loader2, Plus } from "lucide-react";
import type { ActionState } from "@/lib/farm/action-state";

/* ------------------------------------------------------------------ */
/* Formulário com Server Action                                        */
/* ------------------------------------------------------------------ */

const ErrorsContext = createContext<Record<string, string> | undefined>(undefined);
const PendingContext = createContext(false);

export const fieldClass =
  "h-12 w-full rounded-3xl border border-line bg-surface px-4 text-base outline-none transition placeholder:text-subtle focus:border-brand focus:ring-4 focus:ring-[var(--ring)] aria-[invalid=true]:border-danger";

export function SubmitButton({ children, tone = "primary" }: { children: React.ReactNode; tone?: "primary" | "quiet" }) {
  const pending = useContext(PendingContext);
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-medium transition active:scale-[0.98] disabled:opacity-60 ${
        tone === "primary" ? "bg-brand text-brand-fg hover:bg-brand-strong" : "border border-line bg-surface hover:bg-surface-2"
      }`}
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
      {children}
    </button>
  );
}

export function ActionForm({
  action,
  submitLabel,
  children,
  className = "",
  resetOnSuccess = true,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  // Envia por onSubmit (e não pelo atributo `action`): o React 19 limpa os campos de um formulário com
  // `action` após cada envio, até quando a validação falha, e o produtor perderia o que digitou.
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  };

  return (
    <ErrorsContext.Provider value={state?.fieldErrors}>
      <PendingContext.Provider value={pending}>
      <form ref={ref} onSubmit={onSubmit} className={`space-y-4 ${className}`} noValidate>
        {children}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <SubmitButton>{submitLabel}</SubmitButton>
          {state && (
            <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-leaf" : "text-danger"}`}>
              {state.message}
            </p>
          )}
        </div>
      </form>
      </PendingContext.Provider>
    </ErrorsContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Campos                                                              */
/* ------------------------------------------------------------------ */

export function Field({ name, label, hint, children }: { name: string; label: string; hint?: string; children: React.ReactNode }) {
  const error = useContext(ErrorsContext)?.[name];
  return (
    <div>
      <label htmlFor={`f-${name}`} className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-medium">
        {label}
        {hint && <span className="text-xs font-normal text-subtle">{hint}</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type Common = { name: string; label: string; hint?: string; required?: boolean; placeholder?: string };

function useInvalid(name: string) {
  return Boolean(useContext(ErrorsContext)?.[name]);
}

export function TextField({ name, label, hint, required, placeholder, defaultValue, maxLength, autoComplete, suggestions }: Common & { defaultValue?: string | null; maxLength?: number; autoComplete?: string; suggestions?: string[] }) {
  const invalid = useInvalid(name);
  return (
    <Field name={name} label={label} hint={hint}>
      <input id={`f-${name}`} name={name} defaultValue={defaultValue ?? ""} placeholder={placeholder} required={required} maxLength={maxLength} autoComplete={autoComplete ?? "off"} aria-invalid={invalid} list={suggestions ? `dl-${name}` : undefined} className={fieldClass} />
      {suggestions && (
        <datalist id={`dl-${name}`}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </Field>
  );
}

/** Número digitado em português (aceita vírgula). */
export function NumberField({ name, label, hint, required, placeholder, defaultValue, inputMode = "decimal" }: Common & { defaultValue?: string | number | null; inputMode?: "decimal" | "numeric" }) {
  const invalid = useInvalid(name);
  return (
    <Field name={name} label={label} hint={hint}>
      <input id={`f-${name}`} name={name} defaultValue={defaultValue ?? ""} placeholder={placeholder} required={required} inputMode={inputMode} autoComplete="off" aria-invalid={invalid} className={fieldClass} />
    </Field>
  );
}

export function MoneyField(props: Common & { defaultValue?: string | number | null }) {
  const invalid = useInvalid(props.name);
  return (
    <Field name={props.name} label={props.label} hint={props.hint}>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-subtle">R$</span>
        <input id={`f-${props.name}`} name={props.name} defaultValue={props.defaultValue ?? ""} placeholder={props.placeholder ?? "0,00"} required={props.required} inputMode="decimal" autoComplete="off" aria-invalid={invalid} className={`${fieldClass} pl-11`} />
      </div>
    </Field>
  );
}

export function DateField({ name, label, hint, required, defaultValue }: Common & { defaultValue?: string | null }) {
  const invalid = useInvalid(name);
  return (
    <Field name={name} label={label} hint={hint}>
      <input id={`f-${name}`} name={name} type="date" defaultValue={defaultValue ?? ""} required={required} aria-invalid={invalid} className={fieldClass} />
    </Field>
  );
}

export function SelectField({
  name,
  label,
  hint,
  required,
  options,
  defaultValue,
  emptyLabel,
}: Common & { options: { value: string; label: string }[]; defaultValue?: string | null; emptyLabel?: string }) {
  const invalid = useInvalid(name);
  return (
    <Field name={name} label={label} hint={hint}>
      <select id={`f-${name}`} name={name} defaultValue={defaultValue ?? ""} required={required} aria-invalid={invalid} className={fieldClass}>
        {(emptyLabel !== undefined || !required) && <option value="">{emptyLabel ?? "—"}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function TextAreaField({ name, label, hint, placeholder, defaultValue, maxLength = 1000 }: Common & { defaultValue?: string | null; maxLength?: number }) {
  const invalid = useInvalid(name);
  return (
    <Field name={name} label={label} hint={hint}>
      <textarea id={`f-${name}`} name={name} rows={3} defaultValue={defaultValue ?? ""} placeholder={placeholder} maxLength={maxLength} aria-invalid={invalid} className="w-full rounded-3xl border border-line bg-surface px-4 py-3 text-base outline-none transition placeholder:text-subtle focus:border-brand focus:ring-4 focus:ring-[var(--ring)]" />
    </Field>
  );
}

export function FieldGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 }) {
  return <div className={`grid gap-4 ${cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Painel recolhível "Adicionar …" e botões de ação em linha           */
/* ------------------------------------------------------------------ */

export function AddPanel({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-[28px] border border-line bg-surface shadow-card open:ring-1 open:ring-brand/20 print:hidden">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
        <span className="grid size-8 place-items-center rounded-full bg-brand text-brand-fg">
          <Plus className="size-4 transition group-open:rotate-45" aria-hidden />
        </span>
        <span className="flex-1">{title}</span>
        <ChevronDown className="size-4 text-subtle transition group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-line px-5 py-5">{children}</div>
    </details>
  );
}

function IconSubmit({ children, label, tone }: { children: React.ReactNode; label: string; tone: "danger" | "quiet" | "ok" }) {
  const { pending } = useFormStatus();
  const tones = {
    danger: "text-subtle hover:bg-danger-soft hover:text-danger",
    quiet: "text-muted hover:bg-surface-2 hover:text-fg",
    ok: "text-leaf hover:bg-brand-soft",
  };
  return (
    <button type="submit" disabled={pending} aria-label={label} title={label} className={`grid size-10 place-items-center rounded-full transition disabled:opacity-50 ${tones[tone]}`}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : children}
    </button>
  );
}

/** Botão de ícone que dispara uma Server Action com o id do registro (e pede confirmação, se houver texto). */
export function RowAction({
  action,
  id,
  label,
  icon,
  confirm,
  tone = "danger",
  extra,
}: {
  action: (formData: FormData) => void | Promise<void>;
  id: string;
  label: string;
  icon: React.ReactNode;
  confirm?: string;
  tone?: "danger" | "quiet" | "ok";
  extra?: Record<string, string>;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      {extra && Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <IconSubmit label={label} tone={tone}>
        {icon}
      </IconSubmit>
    </form>
  );
}
