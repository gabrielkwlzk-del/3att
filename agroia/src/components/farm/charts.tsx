/**
 * Gráficos simples em HTML/CSS (sem biblioteca). Regras seguidas: barras finas (≤ 24 px) com ponta
 * arredondada de 4 px e base reta, 2 px de separação entre barras, legenda sempre que há mais de
 * uma série, valor só na ponta, texto em cor de texto (nunca na cor da série) e tabela alternativa.
 */

export type SeriesKey = "receita" | "despesa" | "investimento";

export const SERIES: Record<SeriesKey, { label: string; bar: string; dot: string }> = {
  receita: { label: "Receita", bar: "bg-viz-1", dot: "bg-viz-1" },
  despesa: { label: "Despesa", bar: "bg-viz-2", dot: "bg-viz-2" },
  investimento: { label: "Investimento", bar: "bg-viz-3", dot: "bg-viz-3" },
};

export function Legend({ keys }: { keys: SeriesKey[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legenda">
      {keys.map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <span className={`size-2.5 rounded-full ${SERIES[k].dot}`} aria-hidden /> {SERIES[k].label}
        </li>
      ))}
    </ul>
  );
}

/** Uma série, barras horizontais ordenadas. `barClass` define a cor da série. */
export function BarList({ items, barClass = "bg-viz-2", emptyText }: { items: { label: string; value: number; valueLabel: string; hint?: string }[]; barClass?: string; emptyText?: string }) {
  const max = Math.max(0, ...items.map((i) => i.value));
  if (!items.length || max <= 0) return emptyText ? <p className="text-sm text-muted">{emptyText}</p> : null;
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{i.label}</span>
            <span className="shrink-0 font-medium tabular-nums">
              {i.valueLabel}
              {i.hint && <span className="ml-1.5 text-xs font-normal text-subtle">{i.hint}</span>}
            </span>
          </div>
          <div className="mt-1 h-2.5 rounded-r-[4px] bg-transparent" aria-hidden>
            <div className={`h-full rounded-r-[4px] ${barClass}`} style={{ width: `${Math.max(1.5, (i.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export type Group = { label: string; values: Partial<Record<SeriesKey, number>> };

/** Várias séries por grupo (ex.: receita × despesa por safra). Barras horizontais com 2 px entre si. */
export function GroupedBars({ groups, keys, format, caption }: { groups: Group[]; keys: SeriesKey[]; format: (n: number) => string; caption: string }) {
  const max = Math.max(0, ...groups.flatMap((g) => keys.map((k) => g.values[k] ?? 0)));
  if (!groups.length || max <= 0) return null;
  return (
    <figure>
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{caption}</span>
        {keys.length > 1 && <Legend keys={keys} />}
      </figcaption>
      <ul className="space-y-4">
        {groups.map((g) => (
          <li key={g.label}>
            <p className="mb-1.5 text-sm font-medium">{g.label}</p>
            <div className="flex flex-col gap-0.5">
              {keys.map((k) => {
                const v = g.values[k] ?? 0;
                return (
                  <div key={k} className="flex items-center gap-2" title={`${g.label} · ${SERIES[k].label}: ${format(v)}`}>
                    <div className="h-3.5 min-w-0 flex-1" aria-hidden>
                      <div className={`h-full rounded-r-[4px] ${SERIES[k].bar}`} style={{ width: v > 0 ? `${Math.max(1, (v / max) * 100)}%` : "0" }} />
                    </div>
                    <span className="w-28 shrink-0 text-right text-xs tabular-nums text-muted">{format(v)}</span>
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-muted hover:text-fg">Ver como tabela</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr className="text-muted">
                <th className="py-1.5 pr-3 font-medium">&nbsp;</th>
                {keys.map((k) => (
                  <th key={k} className="px-2 py-1.5 text-right font-medium">
                    {SERIES[k].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.label} className="border-t border-line">
                  <th scope="row" className="py-1.5 pr-3 font-medium">{g.label}</th>
                  {keys.map((k) => (
                    <td key={k} className="px-2 py-1.5 text-right tabular-nums">
                      {format(g.values[k] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/**
 * Faixa de estimativa (P10–P90) com a mediana e as safras anteriores como pontos.
 * Os números também aparecem em texto: a posição não é o único canal de informação.
 */
export function RangeBar({ low, mid, high, history, format }: { low: number; mid: number; high: number; history: { label: string; value: number }[]; format: (n: number) => string }) {
  const all = [low, high, ...history.map((h) => h.value)];
  const lo = Math.max(0, Math.min(...all) * 0.9);
  const hi = Math.max(...all) * 1.05;
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  return (
    <figure>
      <div className="relative mx-2 my-6 h-3 rounded-full bg-surface-2" role="img" aria-label={`Faixa estimada de ${format(low)} a ${format(high)}, mediana ${format(mid)}. ${history.length} safras anteriores.`}>
        <div className="absolute inset-y-0 rounded-full bg-viz-1/30" style={{ left: pos(low), width: `calc(${pos(high)} - ${pos(low)})` }} />
        <div className="absolute top-1/2 h-6 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-viz-1" style={{ left: pos(mid) }} />
        {history.map((h) => (
          <span key={h.label} title={`${h.label}: ${format(h.value)}`} className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-viz-2 ring-2 ring-surface" style={{ left: pos(h.value) }} />
        ))}
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-full bg-viz-1/30" aria-hidden /> Faixa estimada (80% de chance)</span>
        <span className="flex items-center gap-1.5"><span className="h-3.5 w-0.5 bg-viz-1" aria-hidden /> Mediana</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-viz-2" aria-hidden /> Safras anteriores</span>
      </figcaption>
    </figure>
  );
}
