import "server-only";
import { ufName } from "@/lib/domain";
import type {
  CurrentConditions,
  DailyForecast,
  Forecast,
  SprayWindow,
  WeatherAlert,
} from "./types";

/**
 * Integração com a Open-Meteo (https://open-meteo.com): previsão gratuita, sem
 * chave de API, baseada em modelos meteorológicos globais e regionais.
 * Se a API falhar, lançamos WeatherUnavailableError — nunca devolvemos dados
 * inventados ou "padrão".
 */

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const TIMEOUT_MS = 8000;

export class WeatherUnavailableError extends Error {
  constructor(message = "Previsão do tempo indisponível no momento.") {
    super(message);
    this.name = "WeatherUnavailableError";
  }
}

type OpenMeteoResponse = {
  latitude: number;
  longitude: number;
  timezone: string;
  elevation?: number;
  current: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_gusts_10m: number;
    is_day: number;
  };
  hourly: {
    time: string[];
    temperature_2m: (number | null)[];
    relative_humidity_2m: (number | null)[];
    precipitation_probability: (number | null)[];
    precipitation: (number | null)[];
    wind_speed_10m: (number | null)[];
  };
  daily: {
    time: string[];
    weather_code: (number | null)[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
    precipitation_sum: (number | null)[];
    precipitation_probability_max: (number | null)[];
    wind_speed_10m_max: (number | null)[];
    wind_gusts_10m_max: (number | null)[];
    et0_fao_evapotranspiration: (number | null)[];
  };
};

const round1 = (n: number) => Math.round(n * 10) / 10;
/** Número no formato brasileiro (vírgula decimal) para textos. */
const br = (n: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n);

export async function fetchForecast(
  latitude: number,
  longitude: number,
  label: string,
  days = 7,
): Promise<Forecast> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new WeatherUnavailableError("Coordenadas inválidas para a previsão.");
  }

  const params = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    timezone: "auto",
    forecast_days: String(Math.min(Math.max(days, 1), 16)),
    wind_speed_unit: "kmh",
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "precipitation",
      "weather_code",
      "wind_speed_10m",
      "wind_gusts_10m",
      "is_day",
    ].join(","),
    hourly: [
      "temperature_2m",
      "relative_humidity_2m",
      "precipitation_probability",
      "precipitation",
      "wind_speed_10m",
    ].join(","),
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "precipitation_probability_max",
      "wind_speed_10m_max",
      "wind_gusts_10m_max",
      "et0_fao_evapotranspiration",
    ].join(","),
  });

  let data: OpenMeteoResponse;
  try {
    const res = await fetch(`${FORECAST_URL}?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: 900 }, // 15 min: a previsão não muda a cada segundo
    });
    if (!res.ok) throw new WeatherUnavailableError(`Serviço meteorológico respondeu ${res.status}.`);
    data = (await res.json()) as OpenMeteoResponse;
  } catch (error) {
    if (error instanceof WeatherUnavailableError) throw error;
    throw new WeatherUnavailableError();
  }

  if (!data?.current || !data?.daily?.time?.length || !data?.hourly?.time?.length) {
    throw new WeatherUnavailableError("Resposta incompleta do serviço meteorológico.");
  }

  const current: CurrentConditions = {
    time: data.current.time,
    temperature: round1(data.current.temperature_2m),
    apparentTemperature: round1(data.current.apparent_temperature),
    humidity: Math.round(data.current.relative_humidity_2m),
    precipitationMm: round1(data.current.precipitation),
    windKmh: Math.round(data.current.wind_speed_10m),
    gustKmh: Math.round(data.current.wind_gusts_10m),
    weatherCode: data.current.weather_code,
    isDay: data.current.is_day === 1,
  };

  const humidityByDay = new Map<string, number[]>();
  data.hourly.time.forEach((t, i) => {
    const rh = data.hourly.relative_humidity_2m[i];
    if (rh == null) return;
    const day = t.slice(0, 10);
    const list = humidityByDay.get(day) ?? [];
    list.push(rh);
    humidityByDay.set(day, list);
  });

  const daily: DailyForecast[] = [];
  data.daily.time.forEach((date, i) => {
    const tMax = data.daily.temperature_2m_max[i];
    const tMin = data.daily.temperature_2m_min[i];
    if (tMax == null || tMin == null) return; // dia sem dados: omitimos, não inventamos
    const rh = humidityByDay.get(date) ?? [];
    daily.push({
      date,
      weatherCode: data.daily.weather_code[i] ?? 3,
      tempMax: round1(tMax),
      tempMin: round1(tMin),
      precipitationMm: round1(data.daily.precipitation_sum[i] ?? 0),
      precipitationProbability: data.daily.precipitation_probability_max[i],
      windMaxKmh: Math.round(data.daily.wind_speed_10m_max[i] ?? 0),
      gustMaxKmh: Math.round(data.daily.wind_gusts_10m_max[i] ?? 0),
      humidityMin: rh.length ? Math.round(Math.min(...rh)) : null,
      humidityMean: rh.length ? Math.round(rh.reduce((a, b) => a + b, 0) / rh.length) : null,
      et0Mm: data.daily.et0_fao_evapotranspiration[i] != null ? round1(data.daily.et0_fao_evapotranspiration[i]!) : null,
    });
  });

  return {
    location: {
      latitude: data.latitude,
      longitude: data.longitude,
      label,
      timezone: data.timezone,
      elevation: data.elevation ?? null,
    },
    current,
    daily,
    sprayWindows: computeSprayWindows(data, current.time),
    alerts: computeAlerts(daily),
    fetchedAt: new Date().toISOString(),
    source: { name: "Open-Meteo", url: "https://open-meteo.com" },
  };
}

/**
 * Janelas com condições gerais favoráveis à pulverização nas próximas 48 h.
 * Critérios de boas práticas de aplicação amplamente difundidos: temperatura
 * até 30 °C, umidade relativa a partir de 55 %, vento entre 3 e 10 km/h e
 * baixa chance de chuva. O vento previsto é a 10 m de altura — confirme no campo.
 */
function computeSprayWindows(data: OpenMeteoResponse, nowLocal: string): SprayWindow[] {
  const h = data.hourly;
  const startIndex = Math.max(0, h.time.findIndex((t) => t >= nowLocal.slice(0, 13)));
  const windows: SprayWindow[] = [];
  let runStart: number | null = null;

  const isGood = (i: number) => {
    const temp = h.temperature_2m[i];
    const rh = h.relative_humidity_2m[i];
    const wind = h.wind_speed_10m[i];
    const pop = h.precipitation_probability[i];
    const rain = h.precipitation[i];
    if (temp == null || rh == null || wind == null) return false;
    return temp <= 30 && rh >= 55 && wind >= 3 && wind <= 10 && (pop == null || pop <= 20) && (rain ?? 0) === 0;
  };

  const end = Math.min(h.time.length, startIndex + 48);
  for (let i = startIndex; i <= end; i++) {
    const good = i < end && isGood(i);
    if (good && runStart === null) runStart = i;
    if (!good && runStart !== null) {
      const hours = i - runStart;
      if (hours >= 2) {
        windows.push({ start: h.time[runStart], end: h.time[i - 1], hours });
      }
      runStart = null;
    }
  }
  return windows.slice(0, 6);
}

function computeAlerts(daily: DailyForecast[]): WeatherAlert[] {
  const alerts: WeatherAlert[] = [];
  const push = (alert: WeatherAlert) => {
    if (alert.dates.length) alerts.push(alert);
  };

  const frostHigh = daily.filter((d) => d.tempMin <= 1);
  const frostRisk = daily.filter((d) => d.tempMin > 1 && d.tempMin <= 3);
  push({
    level: "alerta",
    kind: "geada",
    title: "Geada provável",
    description: `Mínima prevista de até ${br(Math.min(...frostHigh.map((d) => d.tempMin), 99))} °C. Em noites de céu limpo e sem vento, a temperatura junto ao solo costuma ficar alguns graus abaixo da do ar.`,
    dates: frostHigh.map((d) => d.date),
  });
  push({
    level: "atencao",
    kind: "geada",
    title: "Risco de geada",
    description: "Mínima prevista entre 1 °C e 3 °C. Baixadas e áreas abrigadas do vento são as mais sujeitas.",
    dates: frostRisk.map((d) => d.date),
  });

  const storms = daily.filter((d) => d.weatherCode === 96 || d.weatherCode === 99);
  push({
    level: "alerta",
    kind: "chuva_intensa",
    title: "Tempestade com possibilidade de granizo",
    description: "O modelo indica trovoadas com granizo. Proteja animais, máquinas e estruturas sensíveis.",
    dates: storms.map((d) => d.date),
  });

  const heavyRain = daily.filter((d) => d.precipitationMm >= 50);
  const strongRain = daily.filter((d) => d.precipitationMm >= 30 && d.precipitationMm < 50);
  push({
    level: "alerta",
    kind: "chuva_intensa",
    title: "Chuva muito volumosa",
    description: "Acúmulo previsto de 50 mm ou mais no dia: risco de erosão, alagamento e atraso de operações.",
    dates: heavyRain.map((d) => d.date),
  });
  push({
    level: "atencao",
    kind: "chuva_intensa",
    title: "Chuva forte",
    description: "Acúmulo previsto entre 30 e 50 mm no dia. Evite aplicações e planeje colheita e transporte.",
    dates: strongRain.map((d) => d.date),
  });

  const galeHigh = daily.filter((d) => d.gustMaxKmh >= 75);
  const gale = daily.filter((d) => d.gustMaxKmh >= 50 && d.gustMaxKmh < 75);
  push({
    level: "alerta",
    kind: "vento",
    title: "Rajadas muito fortes",
    description: "Rajadas de 75 km/h ou mais podem causar acamamento, quebra de plantas e danos a estruturas.",
    dates: galeHigh.map((d) => d.date),
  });
  push({
    level: "atencao",
    kind: "vento",
    title: "Rajadas fortes",
    description: "Rajadas entre 50 e 75 km/h. Não pulverize e verifique coberturas e cercas.",
    dates: gale.map((d) => d.date),
  });

  const extremeHeat = daily.filter((d) => d.tempMax >= 38);
  const heat = daily.filter((d) => d.tempMax >= 35 && d.tempMax < 38);
  push({
    level: "alerta",
    kind: "calor",
    title: "Calor extremo",
    description: "Máxima de 38 °C ou mais: alto risco de estresse térmico para animais e lavouras. Garanta sombra e água.",
    dates: extremeHeat.map((d) => d.date),
  });
  push({
    level: "atencao",
    kind: "calor",
    title: "Calor intenso",
    description: "Máxima entre 35 °C e 38 °C. Ajuste horários de manejo dos animais e de aplicações.",
    dates: heat.map((d) => d.date),
  });

  if (daily.length >= 5) {
    const totalRain = daily.reduce((sum, d) => sum + d.precipitationMm, 0);
    const et0Values = daily.map((d) => d.et0Mm).filter((v): v is number => v != null);
    const meanEt0 = et0Values.length ? et0Values.reduce((a, b) => a + b, 0) / et0Values.length : 0;
    if (totalRain < 5 && meanEt0 >= 4) {
      push({
        level: "info",
        kind: "estiagem",
        title: "Semana seca",
        description: `Menos de 5 mm de chuva previstos e evapotranspiração média de ${br(meanEt0)} mm/dia. Acompanhe a umidade do solo e a irrigação.`,
        dates: [daily[0].date, daily[daily.length - 1].date],
      });
    }
  }

  const order = { alerta: 0, atencao: 1, info: 2 } as const;
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}

type GeocodingResult = {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  admin2?: string;
  country_code?: string;
  population?: number;
};

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Converte município + UF em coordenadas (centro aproximado do município). */
export async function geocodeMunicipality(
  municipality: string,
  uf: string,
): Promise<{ latitude: number; longitude: number; label: string } | null> {
  const name = municipality.trim();
  if (!name) return null;
  const params = new URLSearchParams({
    name,
    count: "20",
    language: "pt",
    format: "json",
    countryCode: "BR",
  });

  let results: GeocodingResult[] = [];
  try {
    const res = await fetch(`${GEOCODING_URL}?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: 86400 },
    });
    if (!res.ok) throw new WeatherUnavailableError("Serviço de localização indisponível.");
    const json = (await res.json()) as { results?: GeocodingResult[] };
    results = json.results ?? [];
  } catch (error) {
    if (error instanceof WeatherUnavailableError) throw error;
    throw new WeatherUnavailableError("Serviço de localização indisponível.");
  }

  const stateName = normalize(ufName(uf));
  const target = normalize(name);
  const inState = results.filter(
    (r) => r.country_code === "BR" && r.admin1 && normalize(r.admin1) === stateName,
  );
  const best =
    inState.find((r) => normalize(r.name) === target) ??
    inState.sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0];
  if (!best) return null;
  return {
    latitude: best.latitude,
    longitude: best.longitude,
    label: `${best.name} – ${uf}`,
  };
}
