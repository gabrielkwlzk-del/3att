/** Códigos meteorológicos WMO usados pela Open-Meteo, em português. */

const DESCRIPTIONS: Record<number, string> = {
  0: "Céu limpo",
  1: "Predomínio de sol",
  2: "Parcialmente nublado",
  3: "Nublado",
  45: "Nevoeiro",
  48: "Nevoeiro com geada",
  51: "Garoa fraca",
  53: "Garoa",
  55: "Garoa forte",
  56: "Garoa congelante",
  57: "Garoa congelante forte",
  61: "Chuva fraca",
  63: "Chuva moderada",
  65: "Chuva forte",
  66: "Chuva congelante",
  67: "Chuva congelante forte",
  71: "Neve fraca",
  73: "Neve",
  75: "Neve forte",
  77: "Grãos de neve",
  80: "Pancadas de chuva",
  81: "Pancadas de chuva moderadas",
  82: "Pancadas de chuva fortes",
  85: "Pancadas de neve",
  86: "Pancadas de neve fortes",
  95: "Trovoadas",
  96: "Trovoadas com granizo",
  99: "Trovoadas com granizo forte",
};

export function weatherDescription(code: number): string {
  return DESCRIPTIONS[code] ?? "Condição indisponível";
}

export type WeatherIconKind = "sun" | "partly" | "cloud" | "fog" | "drizzle" | "rain" | "storm" | "snow";

export function weatherIconKind(code: number): WeatherIconKind {
  if (code === 0 || code === 1) return "sun";
  if (code === 2) return "partly";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 85 && code <= 86) return "snow";
  if (code >= 95) return "storm";
  return "cloud";
}

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "2026-11-12" -> "qui, 12/11" sem depender do fuso do navegador. */
export function formatDayLabel(date: string, todayIso?: string): string {
  if (todayIso && date === todayIso) return "Hoje";
  const [y, m, d] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** "2026-11-12T14:00" -> "12/11 14h" */
export function formatLocalHour(isoLocal: string): string {
  const [date, time] = isoLocal.split("T");
  const [, m, d] = date.split("-");
  return `${d}/${m} ${time.slice(0, 2)}h`;
}
