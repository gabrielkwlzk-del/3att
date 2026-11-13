import type { WeatherDay } from "./water";

/**
 * Previsão de produtividade com incerteza. Base ESTATÍSTICA: o histórico do próprio talhão
 * (intervalo de predição t de Student, 80%: P10–P90). O clima entra como indicadores
 * mensuráveis e a IA pode sugerir um ajuste limitado e justificado, nunca um número "mágico".
 */

export type Baseline = {
  n: number;
  mean: number | null;
  sd: number | null;
  min: number | null;
  max: number | null;
  /** P10 e P90 (kg/ha). null quando há menos de 2 safras: não dá para estimar dispersão. */
  low: number | null;
  high: number | null;
};

// Valor crítico t (unilateral 90%) por graus de liberdade
const T90: [number, number][] = [
  [1, 3.078], [2, 1.886], [3, 1.638], [4, 1.533], [5, 1.476], [6, 1.44], [7, 1.415], [8, 1.397],
  [9, 1.383], [10, 1.372], [15, 1.341], [20, 1.325], [30, 1.31], [60, 1.296], [120, 1.289],
];

export function tCritical90(df: number): number {
  if (df < 1) return Number.NaN;
  let value = T90[0][1];
  for (const [d, t] of T90) {
    if (df >= d) value = t;
  }
  return df >= 120 ? 1.282 : value;
}

export function baseline(values: number[]): Baseline {
  const v = values.filter((x) => Number.isFinite(x) && x > 0);
  const n = v.length;
  if (n === 0) return { n, mean: null, sd: null, min: null, max: null, low: null, high: null };
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const min = Math.min(...v);
  const max = Math.max(...v);
  if (n === 1) return { n, mean, sd: null, min, max, low: null, high: null };
  const variance = v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  const half = tCritical90(n - 1) * sd * Math.sqrt(1 + 1 / n);
  return { n, mean, sd, min, max, low: Math.max(0, mean - half), high: mean + half };
}

export type ClimateDay = WeatherDay & { tmax: number | null };

export type WeatherStress = {
  days: number;
  missingDays: number;
  rainTotalMm: number;
  et0TotalMm: number;
  /** chuva ÷ ET0 no período (≈1 = oferta natural de água próxima da demanda) */
  rainToEt0: number | null;
  hotDays: number; // dias com máxima ≥ 34 °C
  longestDrySpell: number; // maior sequência de dias com < 1 mm
};

export function weatherStress(days: ClimateDay[]): WeatherStress {
  let rain = 0;
  let et0 = 0;
  let missing = 0;
  let hot = 0;
  let spell = 0;
  let longest = 0;
  for (const d of days) {
    if (d.rain == null) {
      missing += 1;
      spell = 0;
      continue;
    }
    rain += d.rain;
    if (d.et0 != null) et0 += d.et0;
    if (d.tmax != null && d.tmax >= 34) hot += 1;
    if (d.rain < 1) {
      spell += 1;
      longest = Math.max(longest, spell);
    } else spell = 0;
  }
  return {
    days: days.length,
    missingDays: missing,
    rainTotalMm: rain,
    et0TotalMm: et0,
    rainToEt0: et0 > 0 ? rain / et0 : null,
    hotDays: hot,
    longestDrySpell: longest,
  };
}

export const ADJUSTMENT_MIN = -30;
export const ADJUSTMENT_MAX = 15;

export type AdjustedRange = { low: number; mid: number; high: number; adjustmentPct: number };

/** Aplica o ajuste sugerido (limitado) e alarga a faixa em 5% para cada lado quando há ajuste. */
export function applyAdjustment(b: Baseline, adjustmentPct: number): AdjustedRange | null {
  if (b.mean == null || b.low == null || b.high == null) return null;
  const adj = Math.min(ADJUSTMENT_MAX, Math.max(ADJUSTMENT_MIN, Number.isFinite(adjustmentPct) ? adjustmentPct : 0));
  const f = 1 + adj / 100;
  const widen = adj === 0 ? 1 : 0.95;
  const widenUp = adj === 0 ? 1 : 1.05;
  return { low: b.low * f * widen, mid: b.mean * f, high: b.high * f * widenUp, adjustmentPct: adj };
}
