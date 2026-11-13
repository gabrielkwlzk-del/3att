import type { Metadata } from "next";
import Link from "next/link";
import { CloudOff, Droplets, Trash2 } from "lucide-react";
import { getAuthContext } from "@/lib/supabase/server";
import { loadFields, optionsOf, type FieldRec } from "@/lib/farm/data";
import { kcFor, waterBalance, STAGES, type BalanceResult } from "@/lib/farm/water";
import { addDays, formatDateBR, formatNum1, todayBR } from "@/lib/farm/format";
import { fetchWaterInputs, geocodeMunicipality, WeatherUnavailableError, type AgroDay } from "@/lib/weather/open-meteo";
import { ActionForm, AddPanel, DateField, FieldGrid, NumberField, RowAction, SelectField, TextField } from "@/components/farm/forms";
import { Badge, Card, EmptyState, List, ListRow, Note, PageShell } from "@/components/farm/ui";
import { createIrrigation, deleteIrrigation } from "./actions";

export const metadata: Metadata = { title: "Irrigação" };

type LogRow = { id: string; field_id: string; occurred_on: string; amount_mm: number; method: string | null; duration_hours: number | null };
const METHODS = [{ value: "pivo", label: "Pivô central" }, { value: "aspersao", label: "Aspersão" }, { value: "gotejamento", label: "Gotejamento" }, { value: "sulcos", label: "Sulcos" }, { value: "outro", label: "Outro" }];
const DEFAULT_AWC = 50;

const STATUS = {
  irrigar: { tone: "danger", label: "Irrigar" },
  atencao: { tone: "warn", label: "Atenção" },
  ok: { tone: "ok", label: "Sem necessidade agora" },
} as const;

async function resolveLocation(supabase: Awaited<ReturnType<typeof getAuthContext>>["supabase"]) {
  const { data } = await supabase.from("properties").select("municipality, state, latitude, longitude").maybeSingle();
  if (!data) return null;
  if (data.latitude != null && data.longitude != null) return { lat: Number(data.latitude), lon: Number(data.longitude), label: `${data.municipality} – ${data.state}` };
  try {
    const geo = await geocodeMunicipality(String(data.municipality), String(data.state));
    return geo ? { lat: geo.latitude, lon: geo.longitude, label: geo.label } : null;
  } catch {
    return null;
  }
}

export default async function IrrigationPage() {
  const { supabase } = await getAuthContext();
  const since = addDays(todayBR(), -30);
  const [fields, location, logRes] = await Promise.all([
    loadFields(supabase),
    resolveLocation(supabase),
    supabase.from("irrigation_logs").select("id, field_id, occurred_on, amount_mm, method, duration_hours").gte("occurred_on", since).order("occurred_on", { ascending: false }).limit(500),
  ]);
  const logs = (logRes.data ?? []) as LogRow[];
  const fieldName = new Map(fields.map((f) => [f.id, f.name]));

  let weather: { today: string; observed: AgroDay[]; forecast: AgroDay[] } | null = null;
  let weatherError: string | null = null;
  if (location && fields.length) {
    try {
      weather = await fetchWaterInputs(location.lat, location.lon, 7, 3);
    } catch (e) {
      weatherError = e instanceof WeatherUnavailableError ? e.message : "Previsão do tempo indisponível no momento.";
    }
  }

  const rows = fields.map((f) => {
    const kc = kcFor(f.crop, f.stage);
    let balance: BalanceResult | null = null;
    if (kc && weather) {
      balance = waterBalance({
        observed: weather.observed.map((d) => ({ date: d.date, et0: d.et0, rain: d.rain })),
        forecast: weather.forecast.map((d) => ({ date: d.date, et0: d.et0, rain: d.rain })),
        irrigation: logs.filter((l) => l.field_id === f.id).map((l) => ({ date: l.occurred_on, mm: Number(l.amount_mm) })),
        kc: kc.kc,
        awcMm: f.soilAwcMm ?? DEFAULT_AWC,
      });
    }
    return { field: f, kc, balance };
  });
  // Talhões com estimativa primeiro (os que precisam irrigar no topo); sem dados por último
  const rank = { irrigar: 0, atencao: 1, ok: 2 } as const;
  rows.sort((a, b) => (a.balance ? rank[a.balance.status] : 3) - (b.balance ? rank[b.balance.status] : 3));

  return (
    <PageShell title="Irrigação" description="Registre o que irrigou e veja uma estimativa da necessidade de água de cada talhão.">
      {fields.length === 0 ? (
        <EmptyState icon={<Droplets className="size-5" aria-hidden />} title="Cadastre um talhão primeiro" text="A estimativa usa a cultura, o estágio e a localização da propriedade." />
      ) : (
        <>
          {!location && (
            <Note tone="warn">
              A previsão depende da localização da propriedade. <Link href="/propriedade" className="font-semibold underline">Cadastre o município</Link> para calcular a necessidade de água.
            </Note>
          )}
          {weatherError && (
            <div className="flex items-start gap-3 rounded-[28px] border border-line bg-surface p-5" role="alert">
              <CloudOff className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
              <p className="text-sm text-muted">{weatherError} Sem dados reais de clima não calculamos estimativas.</p>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {rows.map(({ field, kc, balance }) => (
              <FieldBalance key={field.id} field={field} kc={kc} balance={balance} hasWeather={Boolean(weather)} />
            ))}
          </div>

          <Note>
            Estimativa por balanço hídrico: evapotranspiração de referência (ET0) da Open-Meteo × coeficiente de cultura (valores de referência aproximados da FAO-56) − chuva efetiva (80% da chuva diária a partir de 5 mm) − irrigação que você registrou, nos últimos 7 dias, supondo o solo próximo da capacidade de campo no início. Irrigar quando o déficit passa de 50% da água disponível. Não usa sensores de solo (integração ainda não disponível) e não substitui o manejo de um técnico.
          </Note>
        </>
      )}

      {fields.length > 0 && (
        <AddPanel title="Registrar irrigação">
          <ActionForm action={createIrrigation} submitLabel="Salvar registro">
            <FieldGrid cols={3}>
              <SelectField name="field_id" label="Talhão" required options={optionsOf(fields)} />
              <DateField name="occurred_on" label="Data" required defaultValue={todayBR()} />
              <NumberField name="amount_mm" label="Lâmina aplicada (mm)" required placeholder="Ex.: 12" />
              <SelectField name="method" label="Método" options={METHODS} />
              <NumberField name="duration_hours" label="Duração (h)" hint="opcional" />
              <TextField name="notes" label="Observação" hint="opcional" />
            </FieldGrid>
          </ActionForm>
        </AddPanel>
      )}

      {logs.length > 0 && (
        <Card title="Últimos 30 dias">
          <List>
            {logs.slice(0, 25).map((l) => (
              <ListRow key={l.id} actions={<RowAction action={deleteIrrigation} id={l.id} label="Excluir registro" icon={<Trash2 className="size-4" />} confirm="Excluir este registro de irrigação?" />}>
                <p className="font-medium">{fieldName.get(l.field_id) ?? "Talhão removido"} · {formatNum1(Number(l.amount_mm))} mm</p>
                <p className="text-sm text-muted">{formatDateBR(l.occurred_on)}{l.method ? ` · ${METHODS.find((m) => m.value === l.method)?.label}` : ""}{l.duration_hours ? ` · ${formatNum1(Number(l.duration_hours))} h` : ""}</p>
              </ListRow>
            ))}
          </List>
          <p className="mt-3 text-xs text-subtle">
            Total por talhão: {fields.map((f) => ({ f, mm: logs.filter((l) => l.field_id === f.id).reduce((s, l) => s + Number(l.amount_mm), 0) })).filter((x) => x.mm > 0).map((x) => `${x.f.name} ${formatNum1(x.mm)} mm`).join(" · ") || "—"}
          </p>
        </Card>
      )}
    </PageShell>
  );
}

function FieldBalance({ field, kc, balance, hasWeather }: { field: FieldRec; kc: ReturnType<typeof kcFor>; balance: BalanceResult | null; hasWeather: boolean }) {
  const stageLabel = STAGES.find((s) => s.value === field.stage)?.label.split(" (")[0];
  return (
    <section className="rounded-[28px] border border-line bg-surface p-5" aria-label={field.name}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{field.name}</h2>
          <p className="text-sm text-muted">{formatNum1(field.areaHectares)} ha{field.crop ? ` · ${field.crop}` : ""}{stageLabel ? ` · ${stageLabel}` : ""}</p>
        </div>
        {balance && <Badge tone={STATUS[balance.status].tone === "danger" ? "danger" : STATUS[balance.status].tone === "warn" ? "warn" : "ok"}>{STATUS[balance.status].label}</Badge>}
      </div>

      {!kc ? (
        <p className="mt-4 rounded-3xl bg-surface-2 px-4 py-3 text-sm text-muted">
          Informe a <strong>cultura</strong> e o <strong>estágio</strong> deste talhão (e use uma cultura com coeficiente de referência) para estimar a necessidade de água.{" "}
          <Link href="/gestao/talhoes" className="font-medium text-brand underline">Editar talhão</Link>
        </p>
      ) : !balance ? (
        <p className="mt-4 text-sm text-muted">{hasWeather ? "Sem dados suficientes." : "Aguardando a previsão do tempo."}</p>
      ) : (
        <>
          <div className="mt-4">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted">Déficit estimado</span>
              <span className="font-semibold tabular-nums">{formatNum1(balance.depletionMm)} mm <span className="font-normal text-subtle">de {formatNum1(balance.awcMm)} mm disponíveis</span></span>
            </div>
            <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(balance.depletionMm)} aria-valuemin={0} aria-valuemax={Math.round(balance.awcMm)} aria-label="Déficit hídrico estimado">
              <div className={`h-full rounded-full ${balance.status === "irrigar" ? "bg-danger" : balance.status === "atencao" ? "bg-warning" : "bg-leaf"}`} style={{ width: `${Math.min(100, (balance.depletionMm / balance.awcMm) * 100)}%` }} />
              <span className="absolute top-0 h-full w-0.5 bg-fg/60" style={{ left: `${(balance.thresholdMm / balance.awcMm) * 100}%` }} aria-hidden />
            </div>
            <p className="mt-1 text-xs text-subtle">A marca indica o limite de manejo ({formatNum1(balance.thresholdMm)} mm).</p>
          </div>
          <p className="mt-3 text-sm">
            {balance.status === "ok"
              ? balance.daysUntilThreshold != null
                ? `Sem necessidade agora. Se não chover, o limite deve ser atingido em cerca de ${balance.daysUntilThreshold} ${balance.daysUntilThreshold === 1 ? "dia" : "dias"}.`
                : "Sem necessidade agora, e a previsão dos próximos dias não leva ao limite."
              : `Lâmina estimada para repor o déficit: cerca de ${balance.suggestedMm} mm.`}
          </p>
          <p className="mt-2 text-xs text-subtle">
            Kc {kc.kc.toFixed(2).replace(".", ",")} ({kc.cropLabel}{kc.generic ? ", valor genérico" : ""}){field.soilAwcMm == null ? ` · água disponível assumida em ${DEFAULT_AWC} mm: informe a do seu solo no talhão` : ""}
            {balance.missingDays > 0 ? ` · ${balance.missingDays} dia(s) sem dado ignorado(s)` : ""}
          </p>
        </>
      )}
    </section>
  );
}
