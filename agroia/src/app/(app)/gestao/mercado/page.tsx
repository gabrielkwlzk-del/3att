import type { Metadata } from "next";
import Link from "next/link";
import { Bell, BellOff, ChartLine, ExternalLink, Trash2 } from "lucide-react";
import { getAuthContext } from "@/lib/supabase/server";
import { addDays, formatDateBR, formatPercent, todayBR } from "@/lib/farm/format";
import { COMMODITIES, commodityLabel, evaluateAlerts, variation, type Alert, type Quote } from "@/lib/farm/market";
import { ActionForm, AddPanel, DateField, FieldGrid, NumberField, RowAction, SelectField, TextAreaField, TextField } from "@/components/farm/forms";
import { PriceLine } from "@/components/farm/price-line";
import { Badge, Card, EmptyState, List, ListRow, Note, PageShell, Stat } from "@/components/farm/ui";
import { createAlert, createQuote, deleteAlert, deleteQuote, importQuotes, toggleAlert } from "./actions";

export const metadata: Metadata = { title: "Mercado e cotações" };

type QuoteRow = { id: string; commodity: string; price: number; unit: string; quoted_on: string; source: string; source_url: string | null; region: string | null };
const money = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function MarketPage({ searchParams }: PageProps<"/gestao/mercado">) {
  const { c } = await searchParams;
  const { supabase } = await getAuthContext();
  const since = addDays(todayBR(), -180);
  const [quoteRes, alertRes] = await Promise.all([
    supabase.from("market_quotes").select("id, commodity, price, unit, quoted_on, source, source_url, region").gte("quoted_on", since).order("quoted_on", { ascending: true }).limit(4000),
    supabase.from("market_alerts").select("id, commodity, kind, threshold, active").order("created_at", { ascending: false }).limit(100),
  ]);
  const rows = (quoteRes.data ?? []) as QuoteRow[];
  const alerts = ((alertRes.data ?? []) as { id: string; commodity: string; kind: Alert["kind"]; threshold: number; active: boolean }[]).map((a) => ({ ...a, threshold: Number(a.threshold) }));
  const quotes: Quote[] = rows.map((r) => ({ commodity: r.commodity, price: Number(r.price), unit: r.unit, quotedOn: r.quoted_on, source: r.source }));
  const triggered = evaluateAlerts(alerts, quotes);

  const withData = new Set(rows.map((r) => r.commodity));
  const requested = Array.isArray(c) ? c[0] : c;
  const current = (COMMODITIES.some((x) => x.value === requested) ? requested : COMMODITIES.find((x) => withData.has(x.value))?.value ?? "soja") as string;
  const meta = COMMODITIES.find((x) => x.value === current)!;
  const own = rows.filter((r) => r.commodity === current);
  const v = variation(quotes.filter((q) => q.commodity === current));
  const unit = v?.last.unit ?? meta.unit;
  const series = own.filter((r) => r.unit === unit);
  const otherUnits = new Set(own.map((r) => r.unit)).size > 1;
  const recent = [...own].reverse().slice(0, 15);
  // Variação que arredonda para 0,0% é mostrada como 0,0% e sem cor (evita "−0,0%" em vermelho)
  const flat = (p: number | null) => p != null && Math.abs(p) < 0.05;
  const tone = (p: number | null) => (p == null || flat(p) ? "default" : p > 0 ? "good" : "bad");
  const signed = (p: number | null) => (p == null ? "—" : flat(p) ? formatPercent(0) : `${p > 0 ? "+" : ""}${formatPercent(p)}`);

  return (
    <PageShell title="Mercado e cotações" description="Acompanhe preços com histórico, fonte e alertas de variação." wide>
      {triggered.length > 0 && (
        <section aria-label="Alertas disparados" className="space-y-2">
          {triggered.map((t) => (
            <p key={t.alertId} className="flex items-center gap-3 rounded-3xl bg-warning-soft px-4 py-3 text-sm font-medium text-warning"><Bell className="size-4 shrink-0" aria-hidden /> {t.message}</p>
          ))}
        </section>
      )}

      <div className="-mx-4 overflow-x-auto px-4 scrollbar-thin sm:mx-0 sm:px-0" role="tablist" aria-label="Mercadoria">
        <div className="flex w-max gap-2 pb-1">
          {COMMODITIES.map((x) => (
            <Link key={x.value} href={`/gestao/mercado?c=${x.value}`} role="tab" aria-selected={x.value === current} className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition ${x.value === current ? "border-brand bg-brand text-brand-fg" : "border-line bg-surface hover:border-brand/40"}`}>
              {x.label}
              {withData.has(x.value) && <span className={`size-1.5 rounded-full ${x.value === current ? "bg-brand-fg" : "bg-leaf"}`} aria-label="com cotações" />}
            </Link>
          ))}
        </div>
      </div>

      {!v ? (
        <EmptyState icon={<ChartLine className="size-5" aria-hidden />} title={`Nenhuma cotação de ${meta.label.toLowerCase()} nos últimos 180 dias`} text="Lance uma cotação ou cole uma série de preços (data e preço) com a fonte. A AgroIA não busca preços sozinha." />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Variação">
            <Stat label={`Último (${formatDateBR(v.last.quotedOn)})`} value={money(v.last.price)} hint={`${unit} · ${v.last.source}`} />
            <Stat label="Contra a anterior" value={signed(v.vsPreviousPct)} tone={tone(v.vsPreviousPct)} hint={v.previous ? formatDateBR(v.previous.quotedOn) : "sem cotação anterior"} />
            <Stat label="Em 7 dias" value={signed(v.vs7dPct)} tone={tone(v.vs7dPct)} hint="cotação de ~1 semana antes" />
            <Stat label="Em 30 dias" value={signed(v.vs30dPct)} tone={tone(v.vs30dPct)} hint="cotação de ~1 mês antes" />
          </section>

          <Card title={`${meta.label} · histórico`} aside={<Badge tone="muted">{unit}</Badge>}>
            {series.length >= 2 ? (
              <PriceLine unit={unit} points={series.map((r) => ({ date: r.quoted_on, price: Number(r.price), source: r.source }))} />
            ) : (
              <p className="text-sm text-muted">Lance ao menos 2 cotações na mesma unidade para ver o gráfico.</p>
            )}
            {otherUnits && <p className="mt-2 text-xs text-subtle">Há cotações em outras unidades; o gráfico mostra só a unidade da última cotação.</p>}
          </Card>

          <Card title="Cotações lançadas">
            <List>
              {recent.map((r) => (
                <ListRow key={r.id} actions={<RowAction action={deleteQuote} id={r.id} label="Excluir cotação" icon={<Trash2 className="size-4" />} confirm="Excluir esta cotação?" />}>
                  <p className="font-semibold tabular-nums">{money(Number(r.price))} <span className="text-sm font-normal text-muted">{r.unit}</span></p>
                  <p className="mt-0.5 text-sm text-muted">
                    {formatDateBR(r.quoted_on)} · Fonte: {r.source_url ? <a href={r.source_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-medium text-brand underline">{r.source}<ExternalLink className="size-3" aria-hidden /></a> : r.source}
                    {r.region ? ` · ${r.region}` : ""}
                  </p>
                </ListRow>
              ))}
            </List>
          </Card>
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <AddPanel title={`Lançar cotação de ${meta.label.toLowerCase()}`} defaultOpen={!v}>
          <ActionForm action={createQuote} submitLabel="Salvar cotação">
            <FieldGrid>
              <SelectField name="commodity" label="Mercadoria" required defaultValue={current} options={COMMODITIES.map((x) => ({ value: x.value, label: x.label }))} />
              <NumberField name="price" label="Preço" required placeholder="Ex.: 128,50" />
              <TextField name="unit" label="Unidade" required defaultValue={meta.unit} maxLength={20} />
              <DateField name="quoted_on" label="Data da cotação" required defaultValue={todayBR()} />
            </FieldGrid>
            <TextField name="source" label="Fonte" placeholder="Ex.: CEPEA/ESALQ, cooperativa, B3" required maxLength={120} />
            <FieldGrid>
              <TextField name="source_url" label="Link da fonte" hint="opcional" placeholder="https://…" />
              <TextField name="region" label="Praça / região" hint="opcional" placeholder="Ex.: Paranaguá" />
            </FieldGrid>
          </ActionForm>
        </AddPanel>

        <AddPanel title="Importar série de preços (colar)">
          <ActionForm action={importQuotes} submitLabel="Importar cotações">
            <FieldGrid>
              <SelectField name="commodity" label="Mercadoria" required defaultValue={current} options={COMMODITIES.map((x) => ({ value: x.value, label: x.label }))} />
              <TextField name="unit" label="Unidade" required defaultValue={meta.unit} maxLength={20} />
            </FieldGrid>
            <TextField name="source" label="Fonte dos dados" required placeholder="Ex.: CEPEA/ESALQ" maxLength={120} />
            <FieldGrid>
              <TextField name="source_url" label="Link da fonte" hint="opcional" />
              <TextField name="region" label="Praça / região" hint="opcional" />
            </FieldGrid>
            <TextAreaField name="data" label="Data e preço, uma linha por dia" placeholder={"05/11/2026;128,50\n06/11/2026;129,10"} maxLength={200000} />
          </ActionForm>
          <p className="mt-3 text-xs text-subtle">Aceita datas como 05/11/2026 ou 2026-11-05, separador ponto e vírgula, vírgula ou tab, e preço com vírgula decimal. Cotações da mesma data e fonte são atualizadas.</p>
        </AddPanel>
      </div>

      <Card title="Alertas de preço">
        {alerts.length > 0 && (
          <List>
            {alerts.map((a) => (
              <ListRow
                key={a.id}
                actions={
                  <>
                    <RowAction action={toggleAlert} id={a.id} extra={{ active: a.active ? "0" : "1" }} label={a.active ? "Pausar alerta" : "Ativar alerta"} icon={a.active ? <Bell className="size-4" /> : <BellOff className="size-4" />} tone="quiet" />
                    <RowAction action={deleteAlert} id={a.id} label="Excluir alerta" icon={<Trash2 className="size-4" />} confirm="Excluir este alerta?" />
                  </>
                }
              >
                <p className={`font-medium ${a.active ? "" : "text-muted"}`}>
                  {commodityLabel(a.commodity)}: {a.kind === "acima" ? `preço acima de ${money(a.threshold)}` : a.kind === "abaixo" ? `preço abaixo de ${money(a.threshold)}` : `variação de ${money(a.threshold)}% ou mais`}
                </p>
                {!a.active && <p className="text-xs text-subtle">Pausado</p>}
              </ListRow>
            ))}
          </List>
        )}
        <div className={alerts.length ? "mt-4" : ""}>
          <ActionForm action={createAlert} submitLabel="Criar alerta">
            <FieldGrid cols={3}>
              <SelectField name="commodity" label="Mercadoria" required defaultValue={current} options={COMMODITIES.map((x) => ({ value: x.value, label: x.label }))} />
              <SelectField name="kind" label="Avisar quando" required defaultValue="acima" options={[{ value: "acima", label: "Preço ficar acima de" }, { value: "abaixo", label: "Preço ficar abaixo de" }, { value: "variacao", label: "Variar (em %) mais que" }]} />
              <NumberField name="threshold" label="Valor" required placeholder="Ex.: 130 ou 3" />
            </FieldGrid>
          </ActionForm>
        </div>
        <p className="mt-3 text-xs text-subtle">Os alertas são conferidos sempre que você abre o app, com base nas cotações que você lançou. Ainda não há envio de notificação no celular.</p>
      </Card>

      <Note>
        A AgroIA <strong>não busca preços automaticamente</strong>: cada cotação é lançada por você, com a fonte, e isso aparece junto do número. Fontes usuais: CEPEA/ESALQ, B3, Conab, cooperativas e corretoras. Confirme o preço de venda com seu comprador.
      </Note>
    </PageShell>
  );
}
