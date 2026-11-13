import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Info } from "lucide-react";
import { getAuthContext } from "@/lib/supabase/server";
import { FARM_MODULES } from "@/lib/farm/modules";
import { loadHub } from "@/lib/farm/hub";

export const metadata: Metadata = { title: "Gestão" };

export default async function FarmHubPage() {
  const { supabase } = await getAuthContext();
  const hub = await loadHub(supabase);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-12 sm:px-6 sm:pt-10">
      <h1 className="text-2xl font-semibold tracking-tight">Gestão da propriedade</h1>
      <p className="mt-1 text-sm text-muted">Custos, estoque, máquinas, irrigação, tarefas e mercado num só lugar.</p>

      {hub.attention.length > 0 && (
        <section className="mt-6" aria-labelledby="atencao">
          <h2 id="atencao" className="mb-2.5 text-sm font-medium text-muted">Precisa de atenção</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {hub.attention.map((a, i) => (
              <li key={`${a.href}-${i}`}>
                <Link
                  href={a.href}
                  className={`flex items-center gap-3 rounded-3xl px-4 py-3 text-sm transition hover:brightness-[0.98] ${
                    a.tone === "danger" ? "bg-danger-soft text-danger" : a.tone === "warn" ? "bg-warning-soft text-warning" : "bg-info-soft text-info"
                  }`}
                >
                  {a.tone === "info" ? <Info className="size-4 shrink-0" aria-hidden /> : <AlertTriangle className="size-4 shrink-0" aria-hidden />}
                  <span className="flex-1 font-medium">{a.text}</span>
                  <ChevronRight className="size-4 shrink-0 opacity-60" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FARM_MODULES.map(({ key, href, label, description, icon: Icon, tone }, i) => {
          const line = hub.lines[key];
          return (
            <li key={key} className="animate-fade-up" style={{ animationDelay: `${i * 30}ms` }}>
              <Link href={href} className="group flex h-full flex-col rounded-[28px] border border-line bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:border-brand/30 active:scale-[0.99]">
                <span className="flex items-start gap-3">
                  <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${tone}`}>
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-snug">{label}</span>
                    <span className="block text-sm text-muted">{description}</span>
                  </span>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-subtle transition group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden />
                </span>
                {line && (
                  <span className={`mt-3 block rounded-2xl px-3 py-2 text-xs font-medium ${line.tone === "danger" ? "bg-danger-soft text-danger" : line.tone === "warn" ? "bg-warning-soft text-warning" : line.tone === "ok" ? "bg-brand-soft text-brand" : "bg-surface-2 text-muted"}`}>
                    {line.text}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
