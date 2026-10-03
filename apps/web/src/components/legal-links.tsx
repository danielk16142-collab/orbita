import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function LegalLinks({ locale }: { locale: string }) {
  const t = await getTranslations("legal");
  return (
    <footer className="legal-links">
      {(["privacy-policy", "terms-of-service", "cookie-policy", "subprocessors"] as const).map((d) =>
        <Link key={d} href={`/${locale}/legal/${d}`}>{t(`docs.${d}`)}</Link>)}
    </footer>
  );
}
