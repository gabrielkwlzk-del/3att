"use client";

import { useRef, useState } from "react";

export type PricePoint = { date: string; price: number; source: string };

const W = 640;
const H = 220;
const PAD = { l: 52, r: 16, t: 14, b: 26 };

const ptBR = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const full = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Linha de preço (uma série): 2 px, ponto final de 8 px com anel, área a 10 %, grade fina e dica ao passar o dedo/mouse. */
export function PriceLine({ points, unit }: { points: PricePoint[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  if (points.length < 2) return null;

  const prices = points.map((p) => p.price);
  let min = Math.min(...prices);
  let max = Math.max(...prices);
  if (min === max) {
    min *= 0.98;
    max *= 1.02;
  }
  const pad = (max - min) * 0.1;
  min -= pad;
  max += pad;
  const t0 = Date.parse(points[0].date);
  const t1 = Date.parse(points[points.length - 1].date);
  const x = (d: string) => PAD.l + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
  const area = `${path} L${x(points[points.length - 1].date).toFixed(1)},${H - PAD.b} L${x(points[0].date).toFixed(1)},${H - PAD.b} Z`;
  const ticks = [0, 1, 2].map((i) => min + ((max - min) * i) / 2);
  const last = points[points.length - 1];
  const active = hover != null ? points[hover] : null;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let dist = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(x(p.date) - px);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    setHover(best);
  };

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-pan-y"
        role="img"
        aria-label={`Histórico de preços, ${unit}. Último: ${ptBR.format(last.price)} em ${full(last.date)}.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--subtle)">
              {ptBR.format(t)}
            </text>
          </g>
        ))}
        <text x={PAD.l} y={H - 6} fontSize="11" fill="var(--subtle)">
          {dayMonth(points[0].date)}
        </text>
        <text x={W - PAD.r} y={H - 6} fontSize="11" fill="var(--subtle)" textAnchor="end">
          {dayMonth(last.date)}
        </text>
        <path d={area} fill="var(--viz-1)" opacity="0.1" />
        <path d={path} fill="none" stroke="var(--viz-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {active && <line x1={x(active.date)} x2={x(active.date)} y1={PAD.t} y2={H - PAD.b} stroke="var(--muted)" strokeWidth="1" />}
        <circle cx={x((active ?? last).date)} cy={y((active ?? last).price)} r="6" fill="var(--viz-1)" stroke="var(--surface)" strokeWidth="2" />
      </svg>
      {active && (
        <div
          className="pointer-events-none absolute top-1 rounded-2xl border border-line bg-surface px-3 py-2 text-xs shadow-card"
          style={{ left: `${Math.min(70, Math.max(0, (x(active.date) / W) * 100 - 12))}%` }}
          role="status"
        >
          <p className="font-medium tabular-nums">
            {ptBR.format(active.price)} <span className="font-normal text-muted">{unit}</span>
          </p>
          <p className="text-muted">
            {full(active.date)} · {active.source}
          </p>
        </div>
      )}
    </div>
  );
}
