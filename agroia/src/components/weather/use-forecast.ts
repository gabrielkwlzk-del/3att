"use client";

import { useEffect, useState } from "react";
import type { Forecast } from "@/lib/weather/types";

export type ForecastState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: Forecast }
  | { status: "error"; message: string };

export function useForecast(location: { lat: number; lon: number; label: string } | null): ForecastState {
  const [state, setState] = useState<ForecastState>({ status: "idle" });
  const key = location ? `${location.lat.toFixed(4)},${location.lon.toFixed(4)}` : null;

  useEffect(() => {
    if (!location || !key) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    const params = new URLSearchParams({
      lat: String(location.lat),
      lon: String(location.lon),
      label: location.label,
    });
    fetch(`/api/weather?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error ?? "Previsão indisponível no momento.");
        setState({ status: "ready", data: data as Forecast });
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setState({ status: "error", message: e.message || "Previsão indisponível no momento." });
      });
    return () => controller.abort();
    // a chave resume a localização
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
