"use client";
import Link from "next/link";
import { NETWORK_COLOR } from "./shared";

export const CHANNEL_COOKIE = "orbita_channel";

/** Channel switch above the calendar. The choice is remembered (cookie) so the calendar opens on it next time. */
export function ChannelTabs({ items, current, label }: { items: { key: string; label: string; href: string }[]; current: string; label: string }) {
  const remember = (key: string) => { document.cookie = `${CHANNEL_COOKIE}=${key}; path=/; max-age=31536000; samesite=lax`; };
  return (
    <nav className="channel-tabs" aria-label={label}>
      {items.map((i) => (
        <Link key={i.key} href={i.href} onClick={() => remember(i.key)} className={`channel-tab${i.key === current ? " on" : ""}`} aria-current={i.key === current ? "page" : undefined}>
          {i.key !== "all" && <span className="net-dot" style={{ background: NETWORK_COLOR[i.key] }} aria-hidden="true" />}{i.label}
        </Link>
      ))}
    </nav>
  );
}
