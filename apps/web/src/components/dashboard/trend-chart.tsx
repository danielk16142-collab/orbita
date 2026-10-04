"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export type ChartSeries = { id: string; label: string; color: string; points: { x: string; y: number }[] };

const H = 260;

function niceTicks(min: number, max: number, n = 4): number[] {
  const span = max - min || Math.max(1, Math.abs(max) * 0.1);
  const raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step, out: number[] = [];
  for (let v = start; v <= max + step * 0.999; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/**
 * One measure over time, one line per series on a SINGLE axis. Thin 2px lines, an end dot with a 2px surface ring, hairline
 * solid grid, legend (2+ series), end labels only where they do not collide, hover/keyboard tooltip, and a table twin.
 * Series colors follow the entity (fixed per network), never the order.
 */
export function TrendChart({ series, locale, title, tableLabel, dateLabel }: { series: ChartSeries[]; locale: string; title: string; tableLabel: string; dateLabel: string }) {
  const [idx, setIdx] = useState<number | null>(null);
  const [W, setW] = useState(640); // real pixel width, so text keeps its size on small screens instead of shrinking with the drawing
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el); setW(Math.max(280, Math.round(el.clientWidth)));
    return () => ro.disconnect();
  }, []);
  const M = { l: W < 480 ? 44 : 52, r: W < 480 ? 52 : 76, t: 16, b: 30 };
  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const df = useMemo(() => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }), [locale]);
  const days = useMemo(() => [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort(), [series]);
  if (!days.length) return null;

  const all = series.flatMap((s) => s.points.map((p) => p.y));
  const ticks = niceTicks(Math.min(...all), Math.max(...all));
  const lo = ticks[0], hi = ticks[ticks.length - 1] || lo + 1;
  const x = (i: number) => M.l + (days.length === 1 ? (W - M.l - M.r) / 2 : (i * (W - M.l - M.r)) / (days.length - 1));
  const y = (v: number) => H - M.b - ((v - lo) / (hi - lo || 1)) * (H - M.t - M.b);
  const at = (s: ChartSeries, day: string) => s.points.find((p) => p.x === day)?.y;
  const path = (s: ChartSeries) => s.points.map((p, k) => `${k ? "L" : "M"}${x(days.indexOf(p.x)).toFixed(1)},${y(p.y).toFixed(1)}`).join("");
  const ends = series.map((s) => ({ s, p: s.points[s.points.length - 1] })).filter((e) => e.p);
  const collide = ends.some((a, i) => ends.some((b, j) => i < j && Math.abs(y(a.p.y) - y(b.p.y)) < 16));
  const labelDays = [0, Math.floor((days.length - 1) / 2), days.length - 1].filter((v, i, a) => a.indexOf(v) === i);

  const pick = (clientX: number) => {
    const r = box.current?.getBoundingClientRect(); if (!r) return;
    const px = ((clientX - r.left) / r.width) * W;
    setIdx(Math.max(0, Math.min(days.length - 1, Math.round(((px - M.l) / (W - M.l - M.r)) * (days.length - 1)))));
  };
  const active = idx !== null ? days[idx] : null;

  return (
    <figure className="chart card viz-root" aria-label={title}>
      <figcaption className="chart-title">{title}</figcaption>
      {series.length > 1 && (
        <ul className="chart-legend">{series.map((s) => <li key={s.id}><svg width="22" height="10" aria-hidden="true"><line x1="1" y1="5" x2="21" y2="5" stroke={s.color} strokeWidth="2" strokeLinecap="round" /><circle cx="11" cy="5" r="4" fill={s.color} stroke="var(--surface-1)" strokeWidth="2" /></svg> {s.label}</li>)}</ul>
      )}
      <div className="chart-box" ref={box}
        onPointerMove={(e) => pick(e.clientX)} onPointerLeave={() => setIdx(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${series.map((s) => `${s.label}: ${nf.format(s.points[s.points.length - 1]?.y ?? 0)}`).join(", ")}`}
          tabIndex={0} onFocus={() => setIdx((i) => i ?? days.length - 1)} onBlur={() => setIdx(null)}
          onKeyDown={(e) => { if (e.key === "ArrowLeft") { e.preventDefault(); setIdx((i) => Math.max(0, (i ?? days.length - 1) - 1)); } else if (e.key === "ArrowRight") { e.preventDefault(); setIdx((i) => Math.min(days.length - 1, (i ?? 0) + 1)); } else if (e.key === "Escape") setIdx(null); }}>
          {ticks.map((t) => (<g key={t}><line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth="1" /><text x={M.l - 8} y={y(t) + 4} textAnchor="end" className="axis-text">{nf.format(t)}</text></g>))}
          {labelDays.map((i) => <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"} className="axis-text">{df.format(new Date(days[i] + "T12:00:00Z"))}</text>)}
          {series.map((s) => <path key={s.id} d={path(s)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
          {ends.map(({ s, p }) => (
            <g key={s.id}>
              <circle cx={x(days.indexOf(p.x))} cy={y(p.y)} r="4.5" fill={s.color} stroke="var(--surface-1)" strokeWidth="2" />
              {!collide && <text x={x(days.indexOf(p.x)) + 10} y={y(p.y) + 4} className="end-label">{nf.format(p.y)}</text>}
            </g>))}
          {active && <g pointerEvents="none">
            <line x1={x(idx!)} x2={x(idx!)} y1={M.t} y2={H - M.b} stroke="var(--text-secondary)" strokeWidth="1" opacity=".5" />
            {series.map((s) => { const v = at(s, active); return v === undefined ? null : <circle key={s.id} cx={x(idx!)} cy={y(v)} r="4.5" fill={s.color} stroke="var(--surface-1)" strokeWidth="2" />; })}
          </g>}
        </svg>
        {active && (
          <div className="chart-tip" role="status" style={{ left: `${(x(idx!) / W) * 100}%` }}>
            <strong>{df.format(new Date(active + "T12:00:00Z"))}</strong>
            {series.map((s) => { const v = at(s, active); return v === undefined ? null : <div key={s.id}><svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="4" fill={s.color} /></svg> {s.label}: {nf.format(v)}</div>; })}
          </div>)}
      </div>
      <details className="chart-table">
        <summary>{tableLabel}</summary>
        <div className="table-scroll"><table><thead><tr><th scope="col">{dateLabel}</th>{series.map((s) => <th scope="col" key={s.id}>{s.label}</th>)}</tr></thead>
          <tbody>{days.slice(-31).reverse().map((d) => <tr key={d}><th scope="row">{df.format(new Date(d + "T12:00:00Z"))}</th>{series.map((s) => <td key={s.id}>{at(s, d) === undefined ? "—" : nf.format(at(s, d)!)}</td>)}</tr>)}</tbody></table></div>
      </details>
    </figure>
  );
}
