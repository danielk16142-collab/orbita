/** Tiny trend for a stat tile: de-emphasis line, current point in the accent, 2px surface ring on the dot. Decorative: the value and delta carry the meaning. */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <svg className="spark" viewBox="0 0 96 28" aria-hidden="true" />;
  const w = 96, h = 28, pad = 5;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => [pad + (i * (w - 2 * pad)) / (values.length - 1), h - pad - ((v - min) / span) * (h - 2 * pad)] as const);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity=".55" />
      <circle cx={lx} cy={ly} r="4" fill="var(--brand)" stroke="var(--surface-1)" strokeWidth="2" />
    </svg>
  );
}
