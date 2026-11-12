"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CloudOff,
  Droplets,
  Info,
  Loader2,
  LocateFixed,
  MapPin,
  Search,
  Sparkles,
  SprayCan,
  Thermometer,
  Umbrella,
  Wind,
} from "lucide-react";
import { UFS } from "@/lib/domain";
import { formatDayLabel, formatLocalHour, weatherDescription } from "@/lib/weather/codes";
import type { Forecast, WeatherAlert } from "@/lib/weather/types";
import { useForecast } from "./use-forecast";
import { WeatherIcon } from "./weather-icon";

type Location = { lat: number; lon: number; label: string; municipality?: string; uf?: string };

const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const num = (n: number) => numberFormat.format(n);

export function WeatherDashboard({
  initialLocation,
  pendingGeocode,
}: {
  initialLocation: Location | null;
  pendingGeocode: { municipality: string; uf: string } | null;
}) {
  const [location, setLocation] = useState<Location | null>(initialLocation);
  const [editing, setEditing] = useState(!initialLocation && !pendingGeocode);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const state = useForecast(location);

  // Propriedade sem coordenadas salvas: localiza pelo município
  useEffect(() => {
    if (!pendingGeocode || initialLocation) return;
    let cancelled = false;
    const params = new URLSearchParams({ municipio: pendingGeocode.municipality, uf: pendingGeocode.uf });
    fetch(`/api/geocode?${params}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Município não encontrado.");
        if (!cancelled) {
          setLocation({
            lat: data.latitude,
            lon: data.longitude,
            label: data.label,
            municipality: pendingGeocode.municipality,
            uf: pendingGeocode.uf,
          });
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setLocError(e.message);
          setEditing(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pendingGeocode, initialLocation]);

  const locateDevice = () => {
    if (!("geolocation" in navigator)) {
      setLocError("Seu navegador não permite obter a localização.");
      return;
    }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setEditing(false);
        setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: "Minha localização atual" });
      },
      () => {
        setLocating(false);
        setLocError("Não foi possível obter sua localização. Verifique a permissão ou busque pelo município.");
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 },
    );
  };

  const askQuestion = useMemo(() => {
    if (!location) return null;
    const where = location.municipality && location.uf
      ? `${location.municipality} – ${location.uf}`
      : `${location.label} (latitude ${location.lat.toFixed(3)}, longitude ${location.lon.toFixed(3)})`;
    return `Com base na previsão do tempo para ${where} nos próximos dias, que cuidados e decisões de manejo você recomenda para a minha propriedade?`;
  }, [location]);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-line bg-surface p-3.5 sm:p-4">
        {editing ? (
          <LocationSearch
            onFound={(loc) => {
              setLocation(loc);
              setEditing(false);
              setLocError(null);
            }}
            onDevice={locateDevice}
            locating={locating}
            onCancel={location ? () => setEditing(false) : undefined}
          />
        ) : (
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-brand-soft text-brand">
              <MapPin className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-subtle">Previsão para</p>
              <p className="line-clamp-2 font-medium leading-snug">{location?.label ?? "Localizando município…"}</p>
            </div>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="h-10 rounded-full px-4 text-sm font-medium text-brand transition hover:bg-brand-soft"
            >
              Trocar
            </button>
          </div>
        )}
        {locError && <p className="mt-2 text-sm text-danger" role="alert">{locError}</p>}
      </div>

      {state.status === "loading" && <ForecastSkeleton />}
      {state.status === "error" && (
        <div className="flex items-start gap-3 rounded-3xl border border-line bg-surface p-5" role="alert">
          <CloudOff className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
          <div>
            <p className="font-medium">Previsão indisponível</p>
            <p className="mt-0.5 text-sm text-muted">
              {state.message} Não exibimos estimativas sem dados reais. Tente novamente em alguns minutos.
            </p>
          </div>
        </div>
      )}
      {state.status === "ready" && <ForecastView data={state.data} askQuestion={askQuestion} />}
    </div>
  );
}

function LocationSearch({
  onFound,
  onDevice,
  locating,
  onCancel,
}: {
  onFound: (loc: Location) => void;
  onDevice: () => void;
  locating: boolean;
  onCancel?: () => void;
}) {
  const [uf, setUf] = useState("PR");
  const [municipality, setMunicipality] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (municipality.trim().length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ municipio: municipality.trim(), uf });
      const res = await fetch(`/api/geocode?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Município não encontrado.");
      onFound({ lat: data.latitude, lon: data.longitude, label: data.label, municipality: municipality.trim(), uf });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const field = "h-12 rounded-2xl border border-line bg-bg px-3 text-base outline-none focus:border-brand/60";
  return (
    <form onSubmit={search} className="space-y-3">
      <p className="font-medium">Onde fica a lavoura?</p>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="clima-uf">Estado</label>
        <select id="clima-uf" value={uf} onChange={(e) => setUf(e.target.value)} className={`${field} w-[5.5rem]`}>
          {UFS.map((u) => (
            <option key={u.sigla} value={u.sigla}>
              {u.sigla}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="clima-municipio">Município</label>
        <input
          id="clima-municipio"
          value={municipality}
          onChange={(e) => setMunicipality(e.target.value)}
          placeholder="Município"
          className={`${field} min-w-0 flex-1`}
          autoComplete="address-level2"
        />
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={loading || municipality.trim().length < 2}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-brand px-5 text-sm font-medium text-brand-fg transition hover:bg-brand-strong disabled:opacity-50"
        >
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
          Buscar previsão
        </button>
        <button
          type="button"
          onClick={onDevice}
          disabled={locating}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-medium transition hover:bg-surface-2"
        >
          {locating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LocateFixed className="size-4" aria-hidden />}
          Usar minha localização
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="h-11 px-3 text-sm text-muted">
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

function ForecastSkeleton() {
  return (
    <div className="space-y-4" aria-label="Carregando previsão" role="status">
      <div className="h-40 animate-pulse rounded-3xl bg-surface-2" />
      <div className="h-72 animate-pulse rounded-3xl bg-surface-2" />
    </div>
  );
}

const alertStyle: Record<WeatherAlert["level"], string> = {
  alerta: "border-danger/30 bg-danger-soft text-danger",
  atencao: "border-warning/30 bg-warning-soft text-warning",
  info: "border-info/30 bg-info-soft text-info",
};

function ForecastView({ data, askQuestion }: { data: Forecast; askQuestion: string | null }) {
  const today = data.daily[0]?.date;
  const minAll = Math.min(...data.daily.map((d) => d.tempMin));
  const maxAll = Math.max(...data.daily.map((d) => d.tempMax));
  const span = Math.max(1, maxAll - minAll);
  const updated = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(data.fetchedAt));

  return (
    <>
      <section className="overflow-hidden rounded-3xl border border-line bg-surface" aria-labelledby="agora">
        <div className="bg-gradient-to-br from-brand-soft via-surface to-wheat-soft/60 p-5">
          <h2 id="agora" className="text-sm font-medium text-muted">
            Agora · {formatLocalHour(data.current.time).split(" ")[1]}
          </h2>
          <div className="mt-2 flex items-center gap-4">
            <WeatherIcon code={data.current.weatherCode} className="size-14" />
            <div>
              <p className="text-5xl font-semibold tracking-tight tabular-nums">{Math.round(data.current.temperature)}°C</p>
              <p className="text-muted">
                {weatherDescription(data.current.weatherCode)} · sensação {Math.round(data.current.apparentTemperature)}°
              </p>
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-3 divide-x divide-line border-t border-line text-center">
          <div className="p-3">
            <dt className="flex items-center justify-center gap-1 text-xs text-subtle"><Droplets className="size-3.5" aria-hidden /> Umidade</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{data.current.humidity}%</dd>
          </div>
          <div className="p-3">
            <dt className="flex items-center justify-center gap-1 text-xs text-subtle"><Wind className="size-3.5" aria-hidden /> Vento</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{data.current.windKmh} km/h</dd>
          </div>
          <div className="p-3">
            <dt className="flex items-center justify-center gap-1 text-xs text-subtle"><Wind className="size-3.5" aria-hidden /> Rajadas</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{data.current.gustKmh} km/h</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="alertas" className="space-y-2">
        <h2 id="alertas" className="px-1 text-sm font-medium text-muted">Alertas para os próximos dias</h2>
        {data.alerts.length === 0 ? (
          <p className="rounded-3xl border border-line bg-surface p-4 text-sm text-muted">
            Nenhum risco de geada, chuva intensa, vento forte ou calor extremo na previsão atual.
          </p>
        ) : (
          data.alerts.map((a, i) => (
            <div key={`${a.kind}-${i}`} className={`rounded-3xl border p-4 ${alertStyle[a.level]}`}>
              <p className="flex items-center gap-2 font-semibold">
                {a.level === "info" ? <Info className="size-4" aria-hidden /> : <AlertTriangle className="size-4" aria-hidden />}
                {a.title}
              </p>
              <p className="mt-1 text-sm text-fg/80">{a.description}</p>
              <p className="mt-1.5 text-xs font-medium">
                {a.kind === "estiagem"
                  ? `${formatDayLabel(a.dates[0], today)} a ${formatDayLabel(a.dates[1], today)}`
                  : a.dates.map((d) => formatDayLabel(d, today)).join(" · ")}
              </p>
            </div>
          ))
        )}
      </section>

      {askQuestion && (
        <Link
          href={`/chat?topico=clima&q=${encodeURIComponent(askQuestion)}`}
          className="flex items-center gap-3 rounded-3xl bg-brand p-4 text-brand-fg shadow-card transition hover:bg-brand-strong active:scale-[0.99]"
        >
          <Sparkles className="size-5 shrink-0" aria-hidden />
          <span className="flex-1">
            <span className="block font-medium">Pedir recomendações à AgroIA</span>
            <span className="block text-sm opacity-85">Planejamento de plantio, aplicação e colheita com esta previsão</span>
          </span>
        </Link>
      )}

      <section className="rounded-3xl border border-line bg-surface" aria-labelledby="proximos-dias">
        <h2 id="proximos-dias" className="px-4 pt-4 text-sm font-medium text-muted">Próximos {data.daily.length} dias</h2>
        <ul className="divide-y divide-line">
          {data.daily.map((d) => {
            const left = ((d.tempMin - minAll) / span) * 100;
            const width = Math.max(6, ((d.tempMax - d.tempMin) / span) * 100);
            return (
              <li key={d.date} className="grid grid-cols-[4.6rem_2rem_1fr] items-center gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[6rem_2rem_10rem_1fr]">
                <span className="text-sm font-medium">{formatDayLabel(d.date, today)}</span>
                <WeatherIcon code={d.weatherCode} className="size-6" />
                <div className="flex items-center gap-2 text-sm tabular-nums">
                  <span className="w-8 text-right text-muted">{Math.round(d.tempMin)}°</span>
                  <span className="relative h-1.5 flex-1 rounded-full bg-surface-2" aria-hidden>
                    <span
                      className="absolute inset-y-0 rounded-full bg-gradient-to-r from-info/70 via-wheat to-clay"
                      style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
                    />
                  </span>
                  <span className="w-8 font-medium">{Math.round(d.tempMax)}°</span>
                </div>
                <div className="col-span-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted sm:col-span-1 sm:justify-end">
                  <span className="flex items-center gap-1">
                    <Umbrella className="size-3.5 text-info" aria-hidden />
                    {num(d.precipitationMm)} mm{d.precipitationProbability != null ? ` (${d.precipitationProbability}%)` : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    <Wind className="size-3.5" aria-hidden /> {d.windMaxKmh}/{d.gustMaxKmh} km/h
                  </span>
                  {d.humidityMin != null && (
                    <span className="flex items-center gap-1">
                      <Droplets className="size-3.5" aria-hidden /> mín {d.humidityMin}%
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-3xl border border-line bg-surface p-4" aria-labelledby="pulverizacao">
        <h2 id="pulverizacao" className="flex items-center gap-2 font-medium">
          <SprayCan className="size-5 text-leaf" aria-hidden /> Janelas para pulverização (48 h)
        </h2>
        {data.sprayWindows.length ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {data.sprayWindows.map((w) => (
              <li key={w.start} className="rounded-2xl bg-brand-soft px-3 py-2 text-sm text-brand">
                <span className="font-medium">{formatLocalHour(w.start)}</span> até {formatLocalHour(w.end).split(" ")[1]} ·{" "}
                {w.hours} h
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">Nenhum período de 2 h ou mais com condições favoráveis nas próximas 48 h.</p>
        )}
        <p className="mt-3 flex items-start gap-1.5 text-xs text-subtle">
          <Thermometer className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Critério geral de boas práticas: até 30 °C, umidade a partir de 55 %, vento entre 3 e 10 km/h e baixa chance de
          chuva. O vento previsto é a 10 m de altura — confirme no campo e siga a bula e o receituário agronômico.
        </p>
      </section>

      <p className="px-1 text-xs text-subtle">
        Dados: <a href={data.source.url} target="_blank" rel="noopener noreferrer" className="underline">{data.source.name}</a> ·
        atualizado às {updated} · fuso {data.location.timezone}
        {data.location.elevation != null ? ` · altitude do ponto ${Math.round(data.location.elevation)} m` : ""}. Previsões
        numéricas têm incerteza, maior nos dias mais distantes. Alertas calculados pela AgroIA a partir desses dados.
      </p>
    </>
  );
}
