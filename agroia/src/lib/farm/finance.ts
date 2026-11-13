import { normalizeText } from "./format";
import { kgToSacas, toKg, type HarvestUnit } from "./units";

export type TxKind = "despesa" | "receita" | "investimento";

export type Tx = {
  kind: TxKind;
  amountCents: number;
  seasonId: string | null;
  fieldId: string | null;
  category: string;
  occurredOn: string;
};

export type Harvest = { seasonId: string; fieldId: string; amount: number; unit: HarvestUnit; crop?: string };
export type FieldArea = { id: string; name: string; areaHectares: number };
export type Season = { id: string; name: string; startDate: string | null };

export type Summary = {
  receita: number;
  despesa: number;
  investimento: number;
  /** receita − despesas (investimentos ficam fora do resultado operacional) */
  resultado: number;
  /** resultado ÷ receita, em %. null se não há receita. */
  margemPct: number | null;
  /** receita − despesas − investimentos */
  resultadoAposInvestimento: number;
};

export function summarize(txs: Tx[]): Summary {
  let receita = 0;
  let despesa = 0;
  let investimento = 0;
  for (const t of txs) {
    if (t.kind === "receita") receita += t.amountCents;
    else if (t.kind === "despesa") despesa += t.amountCents;
    else investimento += t.amountCents;
  }
  const resultado = receita - despesa;
  return {
    receita,
    despesa,
    investimento,
    resultado,
    margemPct: receita > 0 ? (resultado / receita) * 100 : null,
    resultadoAposInvestimento: resultado - investimento,
  };
}

export type CategoryRow = { category: string; cents: number; pct: number };

export function byCategory(txs: Tx[], kind: TxKind): CategoryRow[] {
  const map = new Map<string, number>();
  let total = 0;
  for (const t of txs) {
    if (t.kind !== kind) continue;
    map.set(t.category, (map.get(t.category) ?? 0) + t.amountCents);
    total += t.amountCents;
  }
  return [...map.entries()]
    .map(([category, cents]) => ({ category, cents, pct: total > 0 ? (cents / total) * 100 : 0 }))
    .sort((a, b) => b.cents - a.cents);
}

export type FieldRow = {
  fieldId: string | null;
  name: string;
  areaHectares: number | null;
  despesa: number;
  receita: number;
  custoPorHa: number | null;
  resultado: number;
};

export function byField(txs: Tx[], fields: FieldArea[]): FieldRow[] {
  const index = new Map(fields.map((f) => [f.id, f]));
  const keys = new Set<string | null>(txs.map((t) => t.fieldId));
  return [...keys]
    .map((key) => {
      const field = key ? index.get(key) : undefined;
      const own = txs.filter((t) => t.fieldId === key);
      const s = summarize(own);
      const area = field?.areaHectares ?? null;
      return {
        fieldId: key,
        name: field?.name ?? "Sem talhão (geral)",
        areaHectares: area,
        despesa: s.despesa,
        receita: s.receita,
        custoPorHa: area ? Math.round(s.despesa / area) : null,
        resultado: s.resultado,
      };
    })
    .sort((a, b) => b.despesa - a.despesa);
}

export type SeasonRow = {
  seasonId: string;
  name: string;
  summary: Summary;
  /** Área usada nos indicadores por hectare e de onde ela veio. */
  areaHectares: number | null;
  /** "talhoes": talhões que tiveram colheita ou lançamento na safra; "todos": nada informado, usa a área total. */
  areaBasis: "talhoes" | "todos" | null;
  custoPorHa: number | null;
  receitaPorHa: number | null;
  /** Produção total (todas as culturas) em kg */
  producaoKg: number;
  /** Cultura principal da safra (a de maior área colhida) e sua produtividade. Culturas diferentes não se misturam. */
  culturaPrincipal: string | null;
  kgPorHa: number | null;
  scPorHa: number | null;
  /** Há mais de uma cultura colhida na safra. */
  culturasMistas: boolean;
  /** Despesas ÷ sacas de 60 kg: ponto de equilíbrio do preço. Só com uma única cultura (senão as despesas são de várias). */
  custoPorSaca: number | null;
};

/** Indicadores de uma safra. Nada é inventado: sem dado suficiente o campo fica null. */
export function seasonRow(season: Season, txs: Tx[], harvests: Harvest[], fields: FieldArea[]): SeasonRow {
  const own = txs.filter((t) => t.seasonId === season.id);
  const hs = harvests.filter((h) => h.seasonId === season.id);
  const summary = summarize(own);
  const areaOf = (ids: Iterable<string>) => {
    let sum = 0;
    for (const id of new Set(ids)) sum += fields.find((f) => f.id === id)?.areaHectares ?? 0;
    return sum;
  };

  // Área: talhões que tiveram colheita ou lançamento específico na safra
  const involved = new Set<string>([...hs.map((h) => h.fieldId), ...own.map((t) => t.fieldId).filter((id): id is string => Boolean(id))]);
  let areaHectares: number | null = null;
  let areaBasis: SeasonRow["areaBasis"] = null;
  const involvedArea = areaOf(involved);
  if (involvedArea > 0) {
    areaHectares = involvedArea;
    areaBasis = "talhoes";
  } else {
    const all = areaOf(fields.map((f) => f.id));
    if (all > 0) {
      areaHectares = all;
      areaBasis = "todos";
    }
  }

  // Produtividade por cultura: a principal é a de maior área colhida
  const crops = new Map<string, { label: string; kg: number; fields: Set<string> }>();
  for (const h of hs) {
    const key = normalizeText(h.crop ?? "");
    const cur = crops.get(key) ?? { label: h.crop?.trim() || "Cultura", kg: 0, fields: new Set<string>() };
    cur.kg += toKg(h.amount, h.unit);
    cur.fields.add(h.fieldId);
    crops.set(key, cur);
  }
  const ranked = [...crops.values()].map((c) => ({ ...c, area: areaOf(c.fields) })).sort((a, b) => b.area - a.area);
  const main = ranked[0];
  const kgPorHa = main && main.area > 0 && main.kg > 0 ? main.kg / main.area : null;
  const producaoKg = hs.reduce((sum, h) => sum + toKg(h.amount, h.unit), 0);
  const mixed = crops.size > 1;
  return {
    seasonId: season.id,
    name: season.name,
    summary,
    areaHectares,
    areaBasis,
    custoPorHa: areaHectares ? Math.round(summary.despesa / areaHectares) : null,
    receitaPorHa: areaHectares ? Math.round(summary.receita / areaHectares) : null,
    producaoKg,
    culturaPrincipal: main?.label ?? null,
    kgPorHa,
    scPorHa: kgPorHa != null ? kgToSacas(kgPorHa) : null,
    culturasMistas: mixed,
    custoPorSaca: !mixed && producaoKg > 0 && summary.despesa > 0 ? Math.round(summary.despesa / kgToSacas(producaoKg)) : null,
  };
}

export function compareSeasons(seasons: Season[], txs: Tx[], harvests: Harvest[], fields: FieldArea[]): SeasonRow[] {
  return [...seasons]
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? "") || a.name.localeCompare(b.name))
    .map((s) => seasonRow(s, txs, harvests, fields));
}

/** Variação percentual entre dois valores; null se a base é zero/ausente. */
export function pctChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
