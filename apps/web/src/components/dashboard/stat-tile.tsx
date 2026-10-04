import { Sparkline } from "./sparkline";

export type TileView = { value: number | null; delta: number | null; deltaKind: "absolute" | "percent" | "points"; spark: number[] };

/** Label, value, signed delta against a NAMED period, and a 12-point trend. A missing number is shown as "—", never as 0. */
export function StatTile({ label, tile, locale, kind, vsLabel, noData }: {
  label: string; tile: TileView; locale: string; kind: "count" | "percent"; vsLabel: string; noData: string;
}) {
  const nf = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const pf = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "±");
  const value = tile.value === null ? "—" : kind === "percent" ? pf.format(tile.value) : nf.format(tile.value);
  let delta: string | null = null;
  if (tile.delta !== null) {
    const a = Math.abs(tile.delta);
    delta = tile.deltaKind === "percent" ? `${sign(tile.delta)}${Math.round(a * 100)}%` : tile.deltaKind === "points" ? `${sign(tile.delta)}${a.toFixed(1)} pts` : `${sign(tile.delta)}${nf.format(a)}`;
  }
  const arrow = tile.delta === null ? "" : tile.delta > 0 ? "▲" : tile.delta < 0 ? "▼" : "–";
  return (
    <section className="card stat-tile">
      <p className="eyebrow">{label}</p>
      <div className="stat-value">{value}</div>
      <p className="stat-delta">{delta ? <><span aria-hidden="true">{arrow}</span> <span>{delta}</span> <span className="stat-vs">{vsLabel}</span></> : <span className="stat-vs">{tile.value === null ? noData : vsLabel}</span>}</p>
      <Sparkline values={tile.spark} />
    </section>
  );
}
