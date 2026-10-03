"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav({ locale, items }: { locale: string; items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {items.map((i) => {
        const href = `/${locale}/${i.href}`;
        return <Link key={i.href} href={href} aria-current={path.startsWith(href) ? "page" : undefined}>{i.label}</Link>;
      })}
    </nav>
  );
}
