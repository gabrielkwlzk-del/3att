/** Estruturas de clima compartilhadas entre servidor e navegador. */

export type DailyForecast = {
  date: string; // AAAA-MM-DD (fuso local da propriedade)
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  precipitationMm: number;
  precipitationProbability: number | null;
  windMaxKmh: number;
  gustMaxKmh: number;
  humidityMin: number | null;
  humidityMean: number | null;
  et0Mm: number | null;
};

export type CurrentConditions = {
  time: string;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  precipitationMm: number;
  windKmh: number;
  gustKmh: number;
  weatherCode: number;
  isDay: boolean;
};

export type SprayWindow = {
  start: string; // ISO local
  end: string;
  hours: number;
};

export type WeatherAlert = {
  level: "info" | "atencao" | "alerta";
  kind: "geada" | "chuva_intensa" | "vento" | "calor" | "estiagem" | "frio";
  title: string;
  description: string;
  dates: string[];
};

export type Forecast = {
  location: { latitude: number; longitude: number; label: string; timezone: string; elevation: number | null };
  current: CurrentConditions;
  daily: DailyForecast[];
  sprayWindows: SprayWindow[];
  alerts: WeatherAlert[];
  fetchedAt: string;
  source: { name: string; url: string };
};
