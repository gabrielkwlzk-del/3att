"use client";

import Link from "next/link";
import { AlertTriangle, CloudOff, CloudSun, Droplets, Wind } from "lucide-react";
import { weatherDescription } from "@/lib/weather/codes";
import { useForecast } from "./use-forecast";
import { WeatherIcon } from "./weather-icon";

export function MiniWeather({ location }: { location: { lat: number; lon: number; label: string } | null }) {
  const state = useForecast(location);
  const box = "block rounded-[28px] border border-line bg-surface p-4 transition hover:border-brand/30 sm:p-5";

  if (!location) {
    return (
      <Link href="/clima" className={box}>
        <p className="text-sm font-medium text-muted">Clima</p>
        <div className="mt-2 flex items-start gap-3">
          <CloudSun className="mt-0.5 size-5 shrink-0 text-wheat" aria-hidden />
          <p className="text-sm text-muted">Escolha um município para ver a previsão, alertas de geada e janelas de pulverização.</p>
        </div>
      </Link>
    );
  }

  return (
    <Link href="/clima" className={box} aria-live="polite">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted">Clima agora</p>
        <p className="truncate pl-2 text-xs text-subtle">{location.label}</p>
      </div>
      {state.status === "ready" ? (
        <>
          <div className="mt-2 flex items-center gap-3">
            <WeatherIcon code={state.data.current.weatherCode} className="size-10" />
            <div>
              <p className="text-3xl font-semibold tabular-nums">{Math.round(state.data.current.temperature)}°</p>
              <p className="text-sm text-muted">{weatherDescription(state.data.current.weatherCode)}</p>
            </div>
            <div className="ml-auto space-y-1 text-right text-xs text-muted">
              <p className="flex items-center justify-end gap-1">
                <Droplets className="size-3.5" aria-hidden /> {state.data.current.humidity}%
              </p>
              <p className="flex items-center justify-end gap-1">
                <Wind className="size-3.5" aria-hidden /> {state.data.current.windKmh} km/h
              </p>
            </div>
          </div>
          {state.data.alerts[0] && (
            <p
              className={`mt-3 flex items-center gap-1.5 rounded-2xl px-2.5 py-1.5 text-xs font-medium ${
                state.data.alerts[0].level === "alerta" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"
              }`}
            >
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden /> {state.data.alerts[0].title}
            </p>
          )}
        </>
      ) : state.status === "error" ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <CloudOff className="size-4" aria-hidden /> {state.message}
        </p>
      ) : (
        <div className="mt-3 h-14 animate-pulse rounded-3xl bg-surface-2" aria-label="Carregando previsão" />
      )}
    </Link>
  );
}
