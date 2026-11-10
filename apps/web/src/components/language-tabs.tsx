import Link from "next/link";

const name = (lang: string, locale: string) => { try { const n = new Intl.DisplayNames([locale], { type: "language" }).of(lang) ?? lang; return n.charAt(0).toLocaleUpperCase(locale) + n.slice(1); } catch { return lang.toUpperCase(); } };

/**
 * EN / FR / ES as links: each language has its own strategy and its own calendar. `note` marks a language with nothing in it
 * yet (for example no strategy built). An "All" tab is shown when allHref is given.
 */
export function LanguageTabs({ langs, current, hrefFor, locale, label, note, allHref, allLabel }: {
  langs: readonly string[]; current: string | null; hrefFor: (lang: string) => string; locale: string; label: string;
  note?: (lang: string) => string | null; allHref?: string; allLabel?: string;
}) {
  return (
    <nav className="lang-tabs" aria-label={label}>
      <span className="lang-tabs-label">{label}</span>
      {allHref && <Link href={allHref} aria-current={current === null ? "page" : undefined}>{allLabel}</Link>}
      {langs.map((l) => {
        const n = note?.(l);
        return (
          <Link key={l} href={hrefFor(l)} aria-current={current === l ? "page" : undefined} lang={l}>
            <span className="lang-code">{l.toUpperCase()}</span> {name(l, locale)}{n && <small className="lang-note"> · {n}</small>}
          </Link>
        );
      })}
    </nav>
  );
}
