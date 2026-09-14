"use client";

import { useId, useState } from "react";

/**
 * Inline SVG weight trend. Lime is the brand's one data colour. Dots are
 * buttons so the tooltip is keyboard-reachable; no chart library.
 */
export function WeightChart({ series, targetKg, startKg }: { series: { dateUtc: string; kg: number }[]; targetKg?: number; startKg: number }) {
  const [active, setActive] = useState<number | null>(null);
  const id = useId();
  const W = 720;
  const H = 260;
  const PAD = { l: 44, r: 16, t: 18, b: 34 };

  if (series.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md bg-paper-soft text-[13px] text-muted">
        {series.length === 1 ? "One entry so far — your trend appears from the second weigh-in." : "No weights logged yet."}
      </div>
    );
  }

  const xs = series.map((p) => new Date(p.dateUtc).getTime());
  const ys = series.map((p) => p.kg);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const yVals = [...ys, startKg, ...(targetKg ? [targetKg] : [])];
  const yMinRaw = Math.min(...yVals);
  const yMaxRaw = Math.max(...yVals);
  const span = Math.max(4, yMaxRaw - yMinRaw);
  const yMin = Math.floor(yMinRaw - span * 0.15);
  const yMax = Math.ceil(yMaxRaw + span * 0.15);

  const X = (t: number) => PAD.l + ((t - x0) / Math.max(1, x1 - x0)) * (W - PAD.l - PAD.r);
  const Y = (v: number) => PAD.t + ((yMax - v) / (yMax - yMin)) * (H - PAD.t - PAD.b);

  const pts = series.map((p, i) => ({ x: X(xs[i]), y: Y(p.kg), ...p }));
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${(H - PAD.b).toFixed(1)} L${pts[0].x.toFixed(1)},${(H - PAD.b).toFixed(1)} Z`;

  const ticks = 4;
  const yTicks = Array.from({ length: ticks }, (_, i) => Math.round(yMin + ((yMax - yMin) * i) / (ticks - 1)));
  const monthFmt = new Intl.DateTimeFormat("en-IE", { timeZone: "Europe/Dublin", month: "short" });
  const dayFmt = new Intl.DateTimeFormat("en-IE", { timeZone: "Europe/Dublin", day: "numeric", month: "short" });
  const monthMarks: { x: number; label: string }[] = [];
  let lastMonth = "";
  for (const p of pts) {
    const m = monthFmt.format(new Date(p.dateUtc));
    if (m !== lastMonth) {
      monthMarks.push({ x: p.x, label: m });
      lastMonth = m;
    }
  }

  const a = active !== null ? pts[active] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-labelledby={`${id}-title`}>
        <title id={`${id}-title`}>{`Weight over time, from ${startKg} kg`}</title>
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--color-lime)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--color-lime)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={Y(v)} y2={Y(v)} stroke="var(--color-divider-soft)" strokeWidth={1} />
            <text x={PAD.l - 8} y={Y(v) + 4} textAnchor="end" fontSize={11} fill="var(--color-muted)" fontFamily="inherit">
              {v}
            </text>
          </g>
        ))}
        {targetKg ? (
          <g>
            <line x1={PAD.l} x2={W - PAD.r} y1={Y(targetKg)} y2={Y(targetKg)} stroke="var(--color-blue)" strokeWidth={1.5} strokeDasharray="4 4" />
            <text x={W - PAD.r} y={Y(targetKg) - 6} textAnchor="end" fontSize={11} fill="var(--color-blue-text)" fontFamily="inherit">
              Goal {targetKg} kg
            </text>
          </g>
        ) : null}
        <path d={area} fill={`url(#${id}-fill)`} />
        <path d={line} fill="none" stroke="var(--color-lime-deep)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {monthMarks.map((m) => (
          <text key={m.label + m.x} x={m.x} y={H - 10} textAnchor="middle" fontSize={11} fill="var(--color-muted)" fontFamily="inherit">
            {m.label}
          </text>
        ))}
        {pts.map((p, i) => (
          <g key={p.dateUtc}>
            <circle cx={p.x} cy={p.y} r={active === i ? 6 : 4} fill="var(--color-paper)" stroke="var(--color-lime-deep)" strokeWidth={2} />
            <foreignObject x={p.x - 14} y={p.y - 14} width={28} height={28}>
              <button
                type="button"
                aria-label={`${dayFmt.format(new Date(p.dateUtc))}, ${p.kg.toFixed(1)} kg`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="block size-7 rounded-full bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-blue"
              />
            </foreignObject>
          </g>
        ))}
        {a ? (
          <g pointerEvents="none">
            <rect x={Math.min(W - PAD.r - 96, Math.max(PAD.l, a.x - 48))} y={Math.max(2, a.y - 44)} width={96} height={30} rx={6} fill="var(--color-ink)" />
            <text x={Math.min(W - PAD.r - 96, Math.max(PAD.l, a.x - 48)) + 48} y={Math.max(2, a.y - 44) + 19} textAnchor="middle" fontSize={12} fill="#fff" fontFamily="inherit">
              {dayFmt.format(new Date(a.dateUtc))} · {a.kg.toFixed(1)} kg
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}
