import { diffDays } from "./format";

export type Commodity = "soja" | "milho" | "trigo" | "arroz" | "feijao" | "cafe" | "algodao" | "boi_gordo" | "cana" | "leite";

export const COMMODITIES: { value: Commodity; label: string; unit: string }[] = [
  { value: "soja", label: "Soja", unit: "R$/saca 60 kg" },
  { value: "milho", label: "Milho", unit: "R$/saca 60 kg" },
  { value: "trigo", label: "Trigo", unit: "R$/saca 60 kg" },
  { value: "arroz", label: "Arroz", unit: "R$/saca 50 kg" },
  { value: "feijao", label: "Feijão", unit: "R$/saca 60 kg" },
  { value: "cafe", label: "Café", unit: "R$/saca 60 kg" },
  { value: "algodao", label: "Algodão", unit: "R$/@ (arroba)" },
  { value: "boi_gordo", label: "Boi gordo", unit: "R$/@ (arroba)" },
  { value: "cana", label: "Cana-de-açúcar", unit: "R$/t" },
  { value: "leite", label: "Leite", unit: "R$/litro" },
];

export const commodityLabel = (c: string) => COMMODITIES.find((x) => x.value === c)?.label ?? c;

export type Quote = { commodity: string; price: number; unit: string; quotedOn: string; source: string };

export type Variation = {
  last: Quote;
  previous: Quote | null;
  /** variação % contra a cotação anterior */
  vsPreviousPct: number | null;
  vs7dPct: number | null;
  vs30dPct: number | null;
};

const pct = (cur: number, ref: number | undefined) => (ref ? ((cur - ref) / ref) * 100 : null);

/** Cotação mais recente que tenha pelo menos `n` dias (e no máximo n + tolerância), na mesma unidade. */
function referenceAt(series: Quote[], last: Quote, n: number, tolerance: number): number | undefined {
  const candidates = series.filter((q) => {
    const age = diffDays(q.quotedOn, last.quotedOn);
    return q.unit === last.unit && age >= n && age <= n + tolerance;
  });
  candidates.sort((a, b) => b.quotedOn.localeCompare(a.quotedOn));
  return candidates[0]?.price;
}

export function variation(series: Quote[]): Variation | null {
  const sorted = [...series].sort((a, b) => a.quotedOn.localeCompare(b.quotedOn));
  const last = sorted[sorted.length - 1];
  if (!last) return null;
  const previous = [...sorted].reverse().find((q) => q.quotedOn < last.quotedOn && q.unit === last.unit) ?? null;
  return {
    last,
    previous,
    vsPreviousPct: previous ? pct(last.price, previous.price) : null,
    vs7dPct: pct(last.price, referenceAt(sorted, last, 7, 4)),
    vs30dPct: pct(last.price, referenceAt(sorted, last, 30, 10)),
  };
}

export type Alert = { id: string; commodity: string; kind: "acima" | "abaixo" | "variacao"; threshold: number; active: boolean };
export type TriggeredAlert = { alertId: string; commodity: string; message: string };

export function evaluateAlerts(alerts: Alert[], quotes: Quote[]): TriggeredAlert[] {
  const out: TriggeredAlert[] = [];
  for (const a of alerts) {
    if (!a.active) continue;
    const v = variation(quotes.filter((q) => q.commodity === a.commodity));
    if (!v) continue;
    const label = commodityLabel(a.commodity);
    const price = v.last.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (a.kind === "acima" && v.last.price >= a.threshold) {
      out.push({ alertId: a.id, commodity: a.commodity, message: `${label} em ${price} (${v.last.unit}), acima da sua meta de ${a.threshold.toLocaleString("pt-BR")}.` });
    } else if (a.kind === "abaixo" && v.last.price <= a.threshold) {
      out.push({ alertId: a.id, commodity: a.commodity, message: `${label} em ${price} (${v.last.unit}), abaixo do seu limite de ${a.threshold.toLocaleString("pt-BR")}.` });
    } else if (a.kind === "variacao" && v.vsPreviousPct != null && Math.abs(v.vsPreviousPct) >= a.threshold) {
      const dir = v.vsPreviousPct > 0 ? "alta" : "queda";
      out.push({ alertId: a.id, commodity: a.commodity, message: `${label}: ${dir} de ${Math.abs(v.vsPreviousPct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% desde a cotação anterior.` });
    }
  }
  return out;
}
