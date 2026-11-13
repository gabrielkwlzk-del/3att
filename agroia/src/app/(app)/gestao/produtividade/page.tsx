import type { Metadata } from "next";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { getAuthContext } from "@/lib/supabase/server";
import { loadFields, loadSeasons } from "@/lib/farm/data";
import { baseline, type Baseline, type WeatherStress } from "@/lib/farm/yield";
import { toKg, kgToSacas, type HarvestUnit } from "@/lib/farm/units";
import { formatDateBR, formatInt, formatNum1, normalizeText } from "@/lib/farm/format";
import { STAGES } from "@/lib/farm/water";
import { ActionForm } from "@/components/farm/forms";
import { RangeBar } from "@/components/farm/charts";
import { Badge, Card, EmptyState, Note, PageShell } from "@/components/farm/ui";
import { generateForecast } from "./actions";

export const metadata: Metadata = { title: "Previsão de produtividade" };

type ForecastRow = { id: string; created_at: string; low_kg_ha: number; mid_kg_ha: number; high_kg_ha: number; model: string | null; inputs: ForecastInputs };
type ForecastInputs = {
  baseline?: Baseline; history?: { season: string; kgHa: number }[]; stress?: WeatherStress | null; weatherNote?: string | null; aiNote?: string | null;
  adjustment?: { adjustment_pct: number; confidence: string; factors: string[]; risks: string[]; what_would_improve: string[] } | null;
};

export default async function YieldPage({ searchParams }: PageProps<"/gestao/produtividade">) {
  const { talhao } = await searchParams;
  const { supabase } = await getAuthContext();
  const [fields, seasons, allHarvests] = await Promise.all([
    loadFields(supabase),
    loadSeasons(supabase),
    supabase.from("harvests").select("field_id").limit(5000),
  ]);
  // Sem ?talhao=, abre o talhão com mais colheitas registradas (é onde a estimativa faz sentido)
  const counts = new Map<string, number>();
  for (const h of (allHarvests.data ?? []) as { field_id: string }[]) counts.set(h.field_id, (counts.get(h.field_id) ?? 0) + 1);
  const mostHarvested = [...fields].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))[0];
  const field = fields.find((f) => f.id === (Array.isArray(talhao) ? talhao[0] : talhao)) ?? (mostHarvested && (counts.get(mostHarvested.id) ?? 0) > 0 ? mostHarvested : fields.find((f) => f.crop)) ?? fields[0] ?? null;

  let history: { season: string; kgHa: number }[] = [];
  let forecasts: ForecastRow[] = [];
  if (field) {
    const [hRes, fRes] = await Promise.all([
      supabase.from("harvests").select("season_id, crop, amount, unit").eq("field_id", field.id),
      supabase.from("yield_forecasts").select("id, created_at, low_kg_ha, mid_kg_ha, high_kg_ha, model, inputs").eq("field_id", field.id).order("created_at", { ascending: false }).limit(5),
    ]);
    const names = new Map(seasons.map((s) => [s.id, s.name]));
    const perSeason = new Map<string, number>();
    const crop = field.crop ? normalizeText(field.crop) : null;
    for (const h of (hRes.data ?? []) as { season_id: string; crop: string; amount: number; unit: HarvestUnit }[]) {
      if (crop && normalizeText(h.crop) !== crop) continue;
      perSeason.set(h.season_id, (perSeason.get(h.season_id) ?? 0) + toKg(Number(h.amount), h.unit) / field.areaHectares);
    }
    history = [...perSeason.entries()].map(([id, kgHa]) => ({ season: names.get(id) ?? "Safra", kgHa: Math.round(kgHa) }));
    forecasts = (fRes.data ?? []) as ForecastRow[];
  }
  const base = baseline(history.map((h) => h.kgHa));
  const latest = forecasts[0];
  const stageLabel = STAGES.find((s) => s.value === field?.stage)?.label.split(" (")[0];
  const sacas = (kg: number) => `${formatNum1(kgToSacas(kg))} sc/ha`;

  return (
    <PageShell title="Previsão de produtividade" description="Estimativa por talhão a partir do seu histórico, com faixa de incerteza. É uma estimativa, não uma garantia.">
      {fields.length === 0 ? (
        <EmptyState icon={<TrendingUp className="size-5" aria-hidden />} title="Cadastre um talhão primeiro" text="A estimativa usa as colheitas anteriores do talhão." />
      ) : (
        <>
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Talhão">
            <div className="flex w-max gap-2 pb-1">
              {fields.map((f) => (
                <Link key={f.id} href={`/gestao/produtividade?talhao=${f.id}`} role="tab" aria-selected={f.id === field?.id} className={`inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap transition ${f.id === field?.id ? "border-brand bg-brand text-brand-fg" : "border-line bg-surface hover:border-brand/40"}`}>
                  {f.name}
                </Link>
              ))}
            </div>
          </div>

          {field && (
            <Card title={field.name}>
              <p className="text-sm text-muted">
                {formatNum1(field.areaHectares)} ha{field.crop ? ` · ${field.crop}` : " · cultura não informada"}{stageLabel ? ` · ${stageLabel}` : ""}{field.plantingDate ? ` · plantio ${formatDateBR(field.plantingDate)}` : ""}
              </p>

              <h3 className="mt-5 mb-2 text-sm font-semibold">Histórico do talhão</h3>
              {history.length === 0 ? (
                <p className="text-sm text-muted">Nenhuma colheita registrada{field.crop ? ` de ${field.crop}` : ""}. Registre em <Link href="/gestao/talhoes" className="font-medium text-brand underline">Talhões e safras</Link>.</p>
              ) : (
                <ul className="divide-y divide-line rounded-3xl border border-line text-sm">
                  {history.sort((a, b) => a.season.localeCompare(b.season)).map((h) => (
                    <li key={h.season} className="flex justify-between gap-3 px-4 py-2.5">
                      <span className="font-medium">{h.season}</span>
                      <span className="tabular-nums text-muted">{formatInt(h.kgHa)} kg/ha · {sacas(h.kgHa)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {base.n === 1 && <Note tone="warn">Com apenas 1 safra não é possível medir a variação. Registre ao menos 2 safras para gerar uma faixa de incerteza.</Note>}

              <div className="mt-5">
                <ActionForm action={generateForecast} submitLabel={latest ? "Gerar nova estimativa" : "Gerar estimativa"} resetOnSuccess={false}>
                  <input type="hidden" name="field_id" value={field.id} />
                  <p className="text-xs text-subtle">
                    Usa o histórico acima, o clima medido desde o plantio (precisa de data de plantio e da localização da propriedade) e, se a IA estiver configurada, um ajuste qualitativo limitado a −30%/+15%. Esses dados são enviados ao serviço de IA.
                  </p>
                </ActionForm>
              </div>
            </Card>
          )}

          {latest && field && <ForecastCard f={latest} area={field.areaHectares} history={history} sacas={sacas} />}

          {forecasts.length > 1 && (
            <Card title="Estimativas anteriores">
              <ul className="divide-y divide-line text-sm">
                {forecasts.slice(1).map((f) => (
                  <li key={f.id} className="flex justify-between gap-3 py-2.5">
                    <span>{formatDateBR(f.created_at)}</span>
                    <span className="tabular-nums text-muted">{sacas(Number(f.low_kg_ha))} a {sacas(Number(f.high_kg_ha))} (mediana {sacas(Number(f.mid_kg_ha))})</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Note>
            Como a faixa é calculada: média e dispersão das suas safras anteriores, com intervalo de predição t de Student (80%, ou seja, P10–P90). Com poucas safras a faixa fica larga, de propósito. O clima entra como indicadores medidos; o ajuste da IA é opcional, limitado e sempre mostrado. A estimativa não prevê pragas, doenças nem o clima futuro, e não substitui a avaliação de um agrônomo.
          </Note>
        </>
      )}
    </PageShell>
  );
}

function ForecastCard({ f, area, history, sacas }: { f: ForecastRow; area: number; history: { season: string; kgHa: number }[]; sacas: (kg: number) => string }) {
  const i = f.inputs ?? {};
  const adj = i.adjustment ?? null;
  const stress = i.stress ?? null;
  const low = Number(f.low_kg_ha);
  const mid = Number(f.mid_kg_ha);
  const high = Number(f.high_kg_ha);
  return (
    <Card title="Estimativa mais recente" aside={<Badge tone="muted">{formatDateBR(f.created_at)}</Badge>}>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-3xl bg-surface-2/70 p-3"><p className="text-xs text-muted">Cenário baixo</p><p className="mt-1 font-semibold tabular-nums">{sacas(low)}</p><p className="text-xs text-subtle">{formatInt(low)} kg/ha</p></div>
        <div className="rounded-3xl bg-brand-soft p-3"><p className="text-xs text-brand">Mediana</p><p className="mt-1 text-lg font-semibold tabular-nums">{sacas(mid)}</p><p className="text-xs text-subtle">{formatInt(mid)} kg/ha</p></div>
        <div className="rounded-3xl bg-surface-2/70 p-3"><p className="text-xs text-muted">Cenário alto</p><p className="mt-1 font-semibold tabular-nums">{sacas(high)}</p><p className="text-xs text-subtle">{formatInt(high)} kg/ha</p></div>
      </div>
      <RangeBar low={low} mid={mid} high={high} history={history.map((h) => ({ label: h.season, value: h.kgHa }))} format={(n) => `${formatInt(n)} kg/ha`} />
      <p className="text-sm text-muted">Na área do talhão ({formatNum1(area)} ha): cerca de <strong className="text-fg">{formatInt(kgToSacas(mid * area))} sacas</strong> de 60 kg, entre {formatInt(kgToSacas(low * area))} e {formatInt(kgToSacas(high * area))}.</p>

      <div className="mt-5 space-y-4 text-sm">
        {adj ? (
          <section>
            <h3 className="mb-1 font-semibold">Ajuste sugerido pela IA: {adj.adjustment_pct > 0 ? "+" : ""}{formatNum1(adj.adjustment_pct)}% <span className="font-normal text-muted">(confiança {adj.confidence})</span></h3>
            {adj.factors.length > 0 && <ul className="list-disc space-y-1 pl-5 text-muted marker:text-leaf">{adj.factors.map((x, k) => <li key={k}>{x}</li>)}</ul>}
          </section>
        ) : (
          <p className="text-muted">Sem ajuste da IA: a faixa é só a do histórico.{i.aiNote ? ` ${i.aiNote}` : ""}</p>
        )}
        {adj && adj.risks.length > 0 && (
          <section><h3 className="mb-1 font-semibold">Riscos</h3><ul className="list-disc space-y-1 pl-5 text-muted marker:text-warning">{adj.risks.map((x, k) => <li key={k}>{x}</li>)}</ul></section>
        )}
        {adj && adj.what_would_improve.length > 0 && (
          <section><h3 className="mb-1 font-semibold">O que melhoraria a estimativa</h3><ul className="list-disc space-y-1 pl-5 text-muted marker:text-info">{adj.what_would_improve.map((x, k) => <li key={k}>{x}</li>)}</ul></section>
        )}
        {stress ? (
          <section>
            <h3 className="mb-1 font-semibold">Clima desde o plantio ({stress.days} dias)</h3>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-2xl bg-surface-2/70 p-3"><dt className="text-xs text-muted">Chuva</dt><dd className="font-semibold tabular-nums">{formatInt(stress.rainTotalMm)} mm</dd></div>
              <div className="rounded-2xl bg-surface-2/70 p-3"><dt className="text-xs text-muted">Chuva ÷ ET0</dt><dd className="font-semibold tabular-nums">{stress.rainToEt0 != null ? stress.rainToEt0.toFixed(2).replace(".", ",") : "—"}</dd></div>
              <div className="rounded-2xl bg-surface-2/70 p-3"><dt className="text-xs text-muted">Dias ≥ 34 °C</dt><dd className="font-semibold tabular-nums">{stress.hotDays}</dd></div>
              <div className="rounded-2xl bg-surface-2/70 p-3"><dt className="text-xs text-muted">Maior veranico</dt><dd className="font-semibold tabular-nums">{stress.longestDrySpell} dias</dd></div>
            </dl>
            {stress.missingDays > 0 && <p className="mt-1 text-xs text-subtle">{stress.missingDays} dia(s) sem dado.</p>}
          </section>
        ) : i.weatherNote ? (
          <p className="text-muted">{i.weatherNote}</p>
        ) : null}
      </div>
    </Card>
  );
}
