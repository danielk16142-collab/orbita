import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LEGAL_DOCS, isLegalDoc, loadLegal } from "@/lib/legal";

export default async function LegalPage({ params }: { params: Promise<{ locale: string; doc: string }> }) {
  const { locale, doc } = await params;
  if (!isLegalDoc(doc)) notFound();
  const [t, loaded] = [await getTranslations("legal"), await loadLegal(locale, doc)];
  if (!loaded) notFound();
  return (
    <main className="legal">
      <p className="eyebrow"><Link href={`/${locale}/login`}>Orbita</Link></p>
      {!loaded.translated && <p className="card" role="note">{t("englishPrevails")}</p>}
      <article className="prose">
        {/* react-markdown renders to React elements and does not execute raw HTML. Internal links get the locale prefix. */}
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
          a: ({ href = "", children }) => href.startsWith("/legal/")
            ? <Link href={`/${locale}${href}`}>{children}</Link>
            : <a href={href} rel="noopener noreferrer">{children}</a>,
        }}>{loaded.body}</ReactMarkdown>
      </article>
      <nav className="legal-nav" aria-label={t("all")}>
        {LEGAL_DOCS.map((d) => <Link key={d} href={`/${locale}/legal/${d}`} aria-current={d === doc ? "page" : undefined}>{t(`docs.${d}`)}</Link>)}
      </nav>
    </main>
  );
}
