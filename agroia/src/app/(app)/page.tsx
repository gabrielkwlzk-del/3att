import Link from "next/link";
import {
  ChevronRight,
  CloudSun,
  HelpCircle,
  Leaf,
  MapPin,
  MessageSquareText,
  PawPrint,
  Sprout,
  TrendingUp,
} from "lucide-react";
import { getAuthContext } from "@/lib/supabase/server";
import { getProperty } from "@/lib/data";
import { TOPIC_LABELS, type ConversationRow } from "@/lib/domain";
import { AssistantAvatar } from "@/components/brand/logo";
import { MiniWeather } from "@/components/weather/mini-weather";
import { QuickAsk } from "@/components/quick-ask";
import { PlanBanner } from "@/components/billing/plan-banner";
import { getEntitlements } from "@/lib/billing/entitlements";

const QUICK_ACTIONS = [
  {
    href: "/chat?topico=diagnostico",
    title: "Minha plantação está com problemas",
    description: "Envie fotos e descreva os sintomas",
    icon: Leaf,
    tone: "bg-[#e7f3ea] text-[#1f6b3a] dark:bg-[#173022] dark:text-[#7fcf98]",
  },
  {
    href: "/chat?topico=agricultura",
    title: "Tenho uma dúvida agrícola",
    description: "Solo, plantio, manejo, colheita",
    icon: HelpCircle,
    tone: "bg-[#f6ecd6] text-[#8a6114] dark:bg-[#2b2416] dark:text-[#d9ab55]",
  },
  {
    href: "/clima",
    title: "Consultar o clima",
    description: "Previsão, geada e janelas de aplicação",
    icon: CloudSun,
    tone: "bg-[#e8f0fa] text-[#1d5fa8] dark:bg-[#132538] dark:text-[#7cb4f5]",
  },
  {
    href: "/animais",
    title: "Dúvidas sobre animais",
    description: "Manejo, nutrição e instalações",
    icon: PawPrint,
    tone: "bg-[#f8e8df] text-[#9c4a24] dark:bg-[#33201a] dark:text-[#e08a5f]",
  },
  {
    href: "/chat?topico=produtividade",
    title: "Melhorar minha produtividade",
    description: "Diagnóstico de gargalos e eficiência",
    icon: TrendingUp,
    tone: "bg-[#ecebf8] text-[#4b44a3] dark:bg-[#1f1d38] dark:text-[#a7a2f0]",
  },
] as const;

export default async function HomePage() {
  const { supabase, user } = await getAuthContext();
  const [property, ent, { data: recent }] = await Promise.all([
    getProperty(supabase, user!.id),
    getEntitlements(supabase),
    supabase.from("conversations").select("id, title, topic, updated_at").order("updated_at", { ascending: false }).limit(3),
  ]);
  const conversations = (recent ?? []) as Pick<ConversationRow, "id" | "title" | "topic" | "updated_at">[];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-10 sm:px-6 sm:pt-10">
      <section className="animate-fade-up">
        <div className="flex items-start gap-3">
          <AssistantAvatar className="size-12" />
          <h1 className="text-[1.6rem] leading-tight font-semibold tracking-tight text-balance sm:text-3xl">
            Olá! Sou a AgroIA. Como posso ajudar você na sua propriedade hoje?
          </h1>
        </div>
        <div className="mt-5">
          <QuickAsk />
        </div>
        {ent.enabled && <PlanBanner access={ent.access} usage={ent.usage} />}
      </section>

      <section className="mt-7" aria-labelledby="acoes-rapidas">
        <h2 id="acoes-rapidas" className="sr-only">
          Ações rápidas
        </h2>
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {QUICK_ACTIONS.map(({ href, title, description, icon: Icon, tone }, i) => (
            <li
              key={href}
              className={`animate-fade-up ${i === 0 ? "sm:col-span-2" : ""}`}
              style={{ animationDelay: `${60 + i * 50}ms` }}
            >
              <Link
                href={href}
                className="group flex min-h-[76px] items-center gap-3.5 rounded-3xl border border-line bg-surface p-3.5 pr-3 shadow-card transition hover:-translate-y-0.5 hover:border-brand/30 active:scale-[0.99]"
              >
                <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${tone}`}>
                  <Icon className="size-6" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium leading-snug">{title}</span>
                  <span className="block truncate text-sm text-muted">{description}</span>
                </span>
                <ChevronRight className="size-5 text-subtle transition group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <section aria-labelledby="propriedade-titulo" className="rounded-3xl border border-line bg-surface p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h2 id="propriedade-titulo" className="text-sm font-medium text-muted">
              Sua propriedade
            </h2>
            <Link href="/propriedade" className="text-sm font-medium text-brand">
              {property ? "Editar" : "Cadastrar"}
            </Link>
          </div>
          {property ? (
            <div className="mt-2">
              <p className="text-lg font-semibold">{property.name}</p>
              <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
                <MapPin className="size-3.5" aria-hidden /> {property.municipality} – {property.state}
                {property.area_hectares ? ` · ${Number(property.area_hectares).toLocaleString("pt-BR")} ha` : ""}
              </p>
              {property.crops.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {property.crops.slice(0, 6).map((c) => (
                    <span key={c} className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
                      {c}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-3 text-xs text-subtle">
                {property.share_with_ai
                  ? "As respostas usam estes dados para personalizar as orientações."
                  : "Você não autorizou o uso destes dados nas respostas."}
              </p>
            </div>
          ) : (
            <div className="mt-2 flex items-start gap-3">
              <Sprout className="mt-0.5 size-5 shrink-0 text-wheat" aria-hidden />
              <p className="text-sm text-muted">
                Informe município, culturas e animais para receber orientações adaptadas à sua região e a previsão do
                tempo da sua propriedade.
              </p>
            </div>
          )}
        </section>

        <MiniWeather
          location={
            property?.latitude != null && property?.longitude != null
              ? { lat: property.latitude, lon: property.longitude, label: `${property.municipality} – ${property.state}` }
              : null
          }
        />
      </div>

      {conversations.length > 0 && (
        <section className="mt-8" aria-labelledby="recentes-titulo">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 id="recentes-titulo" className="text-sm font-medium text-muted">
              Continuar conversa
            </h2>
            <Link href="/conversas" className="text-sm font-medium text-brand">
              Ver todas
            </Link>
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link href={`/chat/${c.id}`} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-surface-2">
                  <MessageSquareText className="size-5 shrink-0 text-subtle" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.title}</span>
                    <span className="block text-xs text-subtle">{TOPIC_LABELS[c.topic]}</span>
                  </span>
                  <ChevronRight className="size-4 text-subtle" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
