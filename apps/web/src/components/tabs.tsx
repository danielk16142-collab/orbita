import Link from "next/link";

/** A row of tabs as links (works without JS). Scrolls sideways inside itself on narrow screens. */
export function Tabs({ items, current, label, sub = false }: { items: { key: string; label: string; href: string }[]; current: string; label: string; sub?: boolean }) {
  return (
    <nav className={sub ? "tabs sub" : "tabs"} aria-label={label}>
      {items.map((x) => <Link key={x.key} href={x.href} aria-current={x.key === current ? "page" : undefined}>{x.label}</Link>)}
    </nav>
  );
}
