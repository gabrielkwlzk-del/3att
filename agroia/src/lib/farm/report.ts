import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { byCategory, byField, seasonRow, type CategoryRow, type FieldRow, type Harvest, type SeasonRow, type Tx } from "./finance";
import type { FieldRec, SeasonRec } from "./data";
import { toKg, kgToSacas, type HarvestUnit } from "./units";
import { todayBR } from "./format";

/** Todos os números de um relatório de safra. Página, CSV e resumo por IA usam esta mesma estrutura. */
export type ReportData = {
  season: SeasonRec;
  period: { from: string | null; to: string };
  row: SeasonRow;
  previous: SeasonRow | null;
  categories: CategoryRow[];
  perField: FieldRow[];
  productivity: { fieldId: string; name: string; areaHectares: number; crop: string; kg: number; kgHa: number; scHa: number }[];
  operations: { byKind: Record<string, number>; applications: { date: string | null; field: string | null; product: string | null; dose: string | null; target: string | null; withdrawalDays: number | null }[]; pending: number };
  irrigation: { field: string; mm: number }[];
  machines: { hours: number; fuelCostCents: number; maintenanceCostCents: number };
  transactions: { occurredOn: string; kind: string; category: string; description: string | null; amountCents: number; field: string | null }[];
  harvests: { harvestedOn: string | null; field: string; crop: string; amount: number; unit: string }[];
};

type TxRow = { season_id: string | null; field_id: string | null; kind: Tx["kind"]; category: string; description: string | null; amount_cents: number; occurred_on: string };
type HarvestRow = { season_id: string; field_id: string; crop: string; amount: number; unit: HarvestUnit; harvested_on: string | null };

export async function buildReportData(supabase: SupabaseClient, season: SeasonRec, seasons: SeasonRec[], fields: FieldRec[]): Promise<ReportData> {
  const today = todayBR();
  const from = season.startDate;
  const to = season.endDate && season.endDate < today ? season.endDate : today;
  const inPeriod = (d: string | null) => d != null && (!from || d >= from) && d <= to;

  const [txRes, hRes, taskRes, irrRes, logRes] = await Promise.all([
    supabase.from("transactions").select("season_id, field_id, kind, category, description, amount_cents, occurred_on").limit(10000),
    supabase.from("harvests").select("season_id, field_id, crop, amount, unit, harvested_on").limit(10000),
    supabase.from("tasks").select("title, kind, field_id, due_on, done, completed_on, product, dose, target, withdrawal_days").limit(5000),
    supabase.from("irrigation_logs").select("field_id, amount_mm, occurred_on").limit(10000),
    supabase.from("machine_logs").select("kind, hours, cost_cents, occurred_on").limit(10000),
  ]);

  const txRows = (txRes.data ?? []) as TxRow[];
  const allTxs: Tx[] = txRows.map((t) => ({ kind: t.kind, amountCents: Number(t.amount_cents), seasonId: t.season_id, fieldId: t.field_id, category: t.category, occurredOn: t.occurred_on }));
  const harvestRows = (hRes.data ?? []) as HarvestRow[];
  const allHarvests: Harvest[] = harvestRows.map((h) => ({ seasonId: h.season_id, fieldId: h.field_id, amount: Number(h.amount), unit: h.unit, crop: h.crop }));
  const areas = fields.map((f) => ({ id: f.id, name: f.name, areaHectares: f.areaHectares }));
  const name = new Map(fields.map((f) => [f.id, f.name]));

  const row = seasonRow({ id: season.id, name: season.name, startDate: season.startDate }, allTxs, allHarvests, areas);
  const idx = seasons.findIndex((s) => s.id === season.id);
  // `seasons` vem da mais recente para a mais antiga: a anterior é a próxima da lista
  const prevSeason = idx >= 0 ? seasons[idx + 1] : undefined;
  const previous = prevSeason ? seasonRow({ id: prevSeason.id, name: prevSeason.name, startDate: prevSeason.startDate }, allTxs, allHarvests, areas) : null;

  const seasonTxs = allTxs.filter((t) => t.seasonId === season.id);
  const seasonHarvests = harvestRows.filter((h) => h.season_id === season.id);
  const byFieldKg = new Map<string, { kg: number; crop: string }>();
  for (const h of seasonHarvests) {
    const cur = byFieldKg.get(h.field_id) ?? { kg: 0, crop: h.crop };
    cur.kg += toKg(Number(h.amount), h.unit);
    byFieldKg.set(h.field_id, cur);
  }
  const productivity = [...byFieldKg.entries()].flatMap(([fieldId, v]) => {
    const f = fields.find((x) => x.id === fieldId);
    if (!f) return [];
    const kgHa = v.kg / f.areaHectares;
    return [{ fieldId, name: f.name, areaHectares: f.areaHectares, crop: v.crop, kg: v.kg, kgHa, scHa: kgToSacas(kgHa) }];
  });

  const tasks = (taskRes.data ?? []) as { title: string; kind: string; field_id: string | null; due_on: string | null; done: boolean; completed_on: string | null; product: string | null; dose: string | null; target: string | null; withdrawal_days: number | null }[];
  const doneInPeriod = tasks.filter((t) => t.done && inPeriod(t.completed_on ?? t.due_on));
  const byKind: Record<string, number> = {};
  for (const t of doneInPeriod) byKind[t.kind] = (byKind[t.kind] ?? 0) + 1;
  const applications = doneInPeriod
    .filter((t) => t.kind === "aplicacao")
    .map((t) => ({ date: t.completed_on ?? t.due_on, field: t.field_id ? (name.get(t.field_id) ?? null) : null, product: t.product, dose: t.dose, target: t.target, withdrawalDays: t.withdrawal_days }))
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  const irr = new Map<string, number>();
  for (const l of (irrRes.data ?? []) as { field_id: string; amount_mm: number; occurred_on: string }[]) {
    if (inPeriod(l.occurred_on)) irr.set(l.field_id, (irr.get(l.field_id) ?? 0) + Number(l.amount_mm));
  }

  let hours = 0;
  let fuel = 0;
  let maint = 0;
  for (const l of (logRes.data ?? []) as { kind: string; hours: number | null; cost_cents: number | null; occurred_on: string }[]) {
    if (!inPeriod(l.occurred_on)) continue;
    if (l.kind === "uso") hours += Number(l.hours ?? 0);
    if (l.kind === "abastecimento") fuel += Number(l.cost_cents ?? 0);
    if (l.kind === "manutencao") maint += Number(l.cost_cents ?? 0);
  }

  return {
    season,
    period: { from, to },
    row,
    previous,
    categories: byCategory(seasonTxs, "despesa"),
    perField: byField(seasonTxs, areas),
    productivity,
    operations: { byKind, applications, pending: tasks.filter((t) => !t.done).length },
    irrigation: [...irr.entries()].map(([id, mm]) => ({ field: name.get(id) ?? "Talhão removido", mm })).sort((a, b) => b.mm - a.mm),
    machines: { hours, fuelCostCents: fuel, maintenanceCostCents: maint },
    transactions: txRows
      .filter((t) => t.season_id === season.id)
      .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))
      .map((t) => ({ occurredOn: t.occurred_on, kind: t.kind, category: t.category, description: t.description, amountCents: Number(t.amount_cents), field: t.field_id ? (name.get(t.field_id) ?? null) : null })),
    harvests: seasonHarvests.map((h) => ({ harvestedOn: h.harvested_on, field: name.get(h.field_id) ?? "Talhão removido", crop: h.crop, amount: Number(h.amount), unit: h.unit })),
  };
}

/** Versão enxuta e anônima (sem nomes de pessoas) para a IA resumir. */
export function reportForAi(d: ReportData) {
  const r = d.row;
  const p = d.previous;
  return {
    safra: d.season.name,
    periodo: d.period,
    financeiro_reais: {
      receita: r.summary.receita / 100, despesas: r.summary.despesa / 100, investimentos: r.summary.investimento / 100,
      resultado: r.summary.resultado / 100, margem_pct: r.summary.margemPct,
      custo_por_hectare: r.custoPorHa != null ? r.custoPorHa / 100 : null, custo_por_saca: r.custoPorSaca != null ? r.custoPorSaca / 100 : null,
    },
    produtividade: { cultura_principal: r.culturaPrincipal, sacas_por_ha_da_cultura_principal: r.scPorHa, varias_culturas: r.culturasMistas, producao_total_kg: r.producaoKg, por_talhao: d.productivity.map((x) => ({ talhao: x.name, cultura: x.crop, area_ha: x.areaHectares, kg_ha: Math.round(x.kgHa), sc_ha: Number(x.scHa.toFixed(1)) })) },
    despesas_por_categoria: d.categories.slice(0, 8).map((c) => ({ categoria: c.category, reais: c.cents / 100, pct: Number(c.pct.toFixed(1)) })),
    operacoes_concluidas: d.operations.byKind,
    tarefas_pendentes: d.operations.pending,
    irrigacao_mm_por_talhao: d.irrigation,
    maquinas: { horas: d.machines.hours, combustivel_reais: d.machines.fuelCostCents / 100, manutencao_reais: d.machines.maintenanceCostCents / 100 },
    safra_anterior: p ? { nome: p.name, receita: p.summary.receita / 100, despesas: p.summary.despesa / 100, margem_pct: p.summary.margemPct, custo_por_hectare: p.custoPorHa != null ? p.custoPorHa / 100 : null, sacas_por_ha_cultura_principal: p.scPorHa, cultura_principal: p.culturaPrincipal } : null,
    base_da_area: r.areaBasis,
  };
}
