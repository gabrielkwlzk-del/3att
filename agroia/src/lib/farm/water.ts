import { addDays } from "./format";

/**
 * Balanço hídrico simplificado para apoiar a decisão de irrigar. É uma ESTIMATIVA:
 * depende de ET0 prevista pela Open-Meteo, de coeficientes de cultura de referência e de
 * hipóteses sobre o solo. Não substitui sensores, tensiômetros nem o manejo de um técnico.
 */

export type Stage = "inicial" | "desenvolvimento" | "medio" | "final";
export const STAGES: { value: Stage; label: string }[] = [
  { value: "inicial", label: "Inicial (plantio e emergência)" },
  { value: "desenvolvimento", label: "Desenvolvimento" },
  { value: "medio", label: "Pleno (florescimento e enchimento)" },
  { value: "final", label: "Final (maturação)" },
];

type KcSet = { ini: number; mid: number; end: number; generic?: boolean };

/** Kc de referência por cultura (ordem de grandeza da publicação FAO-56, Tabela 12). Valores aproximados. */
const KC: { match: RegExp; label: string; kc: KcSet }[] = [
  { match: /soja/, label: "Soja", kc: { ini: 0.4, mid: 1.15, end: 0.5 } },
  { match: /milho/, label: "Milho", kc: { ini: 0.3, mid: 1.2, end: 0.6 } },
  { match: /trigo/, label: "Trigo", kc: { ini: 0.3, mid: 1.15, end: 0.25 } },
  { match: /arroz/, label: "Arroz", kc: { ini: 1.05, mid: 1.2, end: 0.9 } },
  { match: /feij/, label: "Feijão", kc: { ini: 0.4, mid: 1.15, end: 0.35 } },
  { match: /cafe/, label: "Café", kc: { ini: 0.9, mid: 0.95, end: 0.95 } },
  { match: /cana/, label: "Cana-de-açúcar", kc: { ini: 0.4, mid: 1.25, end: 0.75 } },
  { match: /algod/, label: "Algodão", kc: { ini: 0.35, mid: 1.15, end: 0.7 } },
  { match: /mandioca/, label: "Mandioca", kc: { ini: 0.3, mid: 0.8, end: 0.3 } },
  { match: /sorgo/, label: "Sorgo", kc: { ini: 0.3, mid: 1.05, end: 0.55 } },
  { match: /aveia/, label: "Aveia", kc: { ini: 0.3, mid: 1.15, end: 0.25 } },
  { match: /hortali/, label: "Hortaliças", kc: { ini: 0.6, mid: 1.05, end: 0.85, generic: true } },
  { match: /fruta/, label: "Frutas", kc: { ini: 0.7, mid: 0.85, end: 0.75, generic: true } },
  { match: /pasto|pastagem|capim/, label: "Pastagem", kc: { ini: 0.4, mid: 0.85, end: 0.85 } },
];

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export type KcResult = { kc: number; cropLabel: string; generic: boolean };

export function kcFor(crop: string | null | undefined, stage: Stage | null | undefined): KcResult | null {
  if (!crop || !stage) return null;
  const hit = KC.find((c) => c.match.test(normalize(crop)));
  if (!hit) return null;
  const { ini, mid, end } = hit.kc;
  const kc = stage === "inicial" ? ini : stage === "medio" ? mid : stage === "final" ? end : (ini + mid) / 2;
  return { kc, cropLabel: hit.label, generic: Boolean(hit.kc.generic) };
}

/** Chuva efetiva: aproximação simples (80% da chuva do dia, só a partir de 5 mm). */
export const effectiveRain = (mm: number) => (mm >= 5 ? mm * 0.8 : 0);

export type WeatherDay = { date: string; et0: number | null; rain: number | null };
export type Irrigation = { date: string; mm: number };

export type DayBalance = { date: string; etc: number; rainEff: number; irrigation: number; depletion: number; projected: boolean };

export type BalanceStatus = "ok" | "atencao" | "irrigar";

export type BalanceResult = {
  status: BalanceStatus;
  /** Déficit hídrico atual estimado na zona radicular (mm) */
  depletionMm: number;
  awcMm: number;
  /** Limite de manejo (fração da água disponível que se aceita consumir) em mm */
  thresholdMm: number;
  /** Lâmina estimada para repor o déficit atual (mm) */
  suggestedMm: number;
  /** Em quantos dias a previsão leva o déficit ao limite, se nenhuma água for aplicada */
  daysUntilThreshold: number | null;
  days: DayBalance[];
  /** Dias sem dado meteorológico (ignorados no cálculo) */
  missingDays: number;
};

export function waterBalance(input: {
  observed: WeatherDay[];
  forecast: WeatherDay[];
  irrigation: Irrigation[];
  kc: number;
  awcMm: number;
  madFraction?: number;
}): BalanceResult {
  const mad = input.madFraction ?? 0.5;
  const threshold = input.awcMm * mad;
  const irrByDate = new Map<string, number>();
  for (const i of input.irrigation) irrByDate.set(i.date, (irrByDate.get(i.date) ?? 0) + i.mm);

  let depletion = 0; // começa em capacidade de campo (hipótese declarada na interface)
  let missing = 0;
  const days: DayBalance[] = [];
  const step = (d: WeatherDay, projected: boolean) => {
    if (d.et0 == null || d.rain == null) {
      missing += 1;
      return;
    }
    const etc = d.et0 * input.kc;
    const rainEff = effectiveRain(d.rain);
    const irrigation = projected ? 0 : (irrByDate.get(d.date) ?? 0);
    depletion = Math.min(input.awcMm, Math.max(0, depletion + etc - rainEff - irrigation));
    days.push({ date: d.date, etc, rainEff, irrigation, depletion, projected });
  };

  for (const d of input.observed) step(d, false);
  const current = depletion;
  let daysUntil: number | null = null;
  if (current < threshold) {
    input.forecast.forEach((d, idx) => {
      step(d, true);
      if (daysUntil == null && depletion >= threshold) daysUntil = idx + 1;
    });
  } else {
    for (const d of input.forecast) step(d, true);
  }

  const status: BalanceStatus = current >= threshold ? "irrigar" : current >= threshold * 0.7 ? "atencao" : "ok";
  return {
    status,
    depletionMm: current,
    awcMm: input.awcMm,
    thresholdMm: threshold,
    suggestedMm: status === "ok" ? 0 : Math.round(current),
    daysUntilThreshold: daysUntil,
    days,
    missingDays: missing,
  };
}

/** Datas (AAAA-MM-DD) da janela de dias passados terminando em `end`, em ordem crescente. */
export function pastDates(end: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(end, -(count - 1 - i)));
}
