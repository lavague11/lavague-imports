"use client";

import { useState } from "react";

export interface TrendPoint { label: string; value: number; prev: number }

const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** Revenue trend (DASHBOARD §1b): current period as a solid line, the previous
 *  period as a faint line behind. Hover/tap a point for its value. */
export function SalesTrendChart({ points, periodLabel }: { points: TrendPoint[]; periodLabel: string }) {
  const [active, setActive] = useState<number | null>(null);
  const W = 720;
  const H = 180;
  const padX = 8;
  const padY = 14;
  const n = points.length;
  const max = Math.max(1, ...points.map((p) => Math.max(p.value, p.prev)));
  const x = (i: number) => padX + (n <= 1 ? 0 : (i / (n - 1)) * (W - 2 * padX));
  const y = (v: number) => H - padY - (v / max) * (H - 2 * padY);
  const path = (key: "value" | "prev") => points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(" ");
  const total = points.reduce((s, p) => s + p.value, 0);

  return (
    <div className="rounded-xl border border-olive-100 bg-white p-4">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-sm font-medium text-olive-800">Revenue · {periodLabel}</p>
        <p className="text-sm font-semibold text-olive-900">{money(total)}</p>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" preserveAspectRatio="none" role="img" aria-label="Revenue trend">
          {/* previous period (faint) */}
          <path d={path("prev")} fill="none" stroke="#b8c0a8" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7} vectorEffect="non-scaling-stroke" />
          {/* current period */}
          <path d={path("value")} fill="none" stroke="#5b6b43" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={x(i)} cy={y(p.value)} r={active === i ? 4 : 2.5} fill="#5b6b43" />
              {/* wide invisible hit area */}
              <rect x={x(i) - (W / n) / 2} y={0} width={W / n} height={H} fill="transparent" onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onClick={() => setActive(i)} />
            </g>
          ))}
        </svg>
        {active != null ? (
          <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-md bg-olive-900 px-2 py-1 text-xs text-white shadow">
            {points[active].label}: <span className="font-semibold">{money(points[active].value)}</span>
            {points[active].prev ? <span className="text-olive-300"> · was {money(points[active].prev)}</span> : null}
          </div>
        ) : null}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-olive-400">
        <span>{points[0]?.label}</span>
        <span>{points[Math.floor(n / 2)]?.label}</span>
        <span>{points[n - 1]?.label}</span>
      </div>
    </div>
  );
}
