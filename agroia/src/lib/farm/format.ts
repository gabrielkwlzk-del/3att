/** Formatação e leitura de números e datas no padrão brasileiro. Sem dependência de fuso do navegador. */

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const num1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const num2 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const num3 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

/** Sinal de menos tipográfico (U+2212): não quebra a linha entre o sinal e o número. */
const noBreakMinus = (s: string) => s.replace(/^-/, "\u2212");

export const formatMoney = (cents: number) => noBreakMinus(brl.format(cents / 100));
export const formatInt = (n: number) => num0.format(n);
export const formatNum1 = (n: number) => num1.format(n);
export const formatNum2 = (n: number) => num2.format(n);
export const formatNum3 = (n: number) => num3.format(n);

export function formatPercent(value: number | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return noBreakMinus(`${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)}%`);
}

/** "2026-11-13" → "13/11/2026" */
export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** "2026-11-13" → "13/11" */
export function formatDayMonth(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

/** Hoje (AAAA-MM-DD) no fuso de Brasília, independente do fuso do servidor. */
export function todayBR(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Soma dias a uma data AAAA-MM-DD (aritmética em UTC, sem surpresas de fuso). */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Diferença em dias (b − a) entre duas datas AAAA-MM-DD. */
export function diffDays(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

export function isIsoDate(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Lê um número digitado em português: "1.234,56", "1234,56", "1234.56", "R$ 12,50", "12,5".
 * Devolve null se não for um número válido.
 */
export function parseDecimalBR(input: string | null | undefined): number | null {
  if (input == null) return null;
  let s = String(input).replace(/R\$/gi, "").replace(/\s/g, "");
  if (!s || !/^[-+]?[\d.,]+$/.test(s)) return null;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ""); // "1.234" e "12.345.678" = separador de milhar
  }
  if ((s.match(/\./g) ?? []).length > 1) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Valor em reais digitado → centavos (inteiro). */
export function parseMoneyToCents(input: string | null | undefined): number | null {
  const n = parseDecimalBR(input);
  if (n == null) return null;
  return Math.round(n * 100);
}

/** Minúsculas e sem acentos, para comparar nomes de cultura digitados de formas diferentes. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
