import { PrivacyPanel } from "@/components/privacy-panel";

export default async function PrivacyPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ submitted?: string; saved?: string; error?: string }> }) {
  const { locale } = await params;
  return <PrivacyPanel locale={locale} q={await searchParams} />;
}
