import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, CreditCard, LogOut, PawPrint, ShieldCheck, Tractor } from "lucide-react";
import { getAuthContext } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mais" };

const ITEMS = [
  { href: "/animais", label: "Assistente de pecuária", description: "Manejo, nutrição e prevenção", icon: PawPrint },
  { href: "/propriedade", label: "Minha propriedade", description: "Localização, culturas, animais e consentimento", icon: Tractor },
  { href: "/plano", label: "Meu plano", description: "Teste grátis, uso do mês e assinatura", icon: CreditCard },
  { href: "/privacidade", label: "Privacidade e dados", description: "Como tratamos suas informações", icon: ShieldCheck },
] as const;

export default async function MorePage() {
  const { user } = await getAuthContext();
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-10 sm:px-6 sm:pt-10">
      <h1 className="text-2xl font-semibold tracking-tight">Mais</h1>
      <ul className="mt-5 divide-y divide-line overflow-hidden rounded-[28px] border border-line bg-surface">
        {ITEMS.map(({ href, label, description, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex items-center gap-3.5 px-4 py-4 transition hover:bg-surface-2">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{label}</span>
                <span className="block truncate text-sm text-muted">{description}</span>
              </span>
              <ChevronRight className="size-4 text-subtle" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <section className="mt-6 rounded-[28px] border border-line bg-surface p-4 text-sm text-muted">
        <p>
          Conectado como <span className="font-medium text-fg">{user!.email}</span>
        </p>
        <form action="/auth/sair" method="post" className="mt-3">
          <button type="submit" className="inline-flex h-11 items-center gap-2 rounded-full border border-line px-5 font-medium text-fg transition hover:bg-surface-2">
            <LogOut className="size-4" aria-hidden /> Sair da conta
          </button>
        </form>
      </section>
    </div>
  );
}
