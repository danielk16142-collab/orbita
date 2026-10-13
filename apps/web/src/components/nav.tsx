"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav({ locale, items }: { locale: string; items: { href: string; label: string }[] }) {
  const path = usePathname();
  // The most specific match wins, so "portal" is not also highlighted on "portal/posts".
  const current = items.map((i) => `/${locale}/${i.href}`).filter((h) => path === h || path.startsWith(`${h}/`)).sort((a, b) => b.length - a.length)[0];
  return (
    <nav className="nav" aria-label="Main">
      {items.map((i) => {
        const href = `/${locale}/${i.href}`;
        return <Link key={i.href} href={href} aria-current={href === current ? "page" : undefined}>{i.label}</Link>;
      })}
    </nav>
  );
}
