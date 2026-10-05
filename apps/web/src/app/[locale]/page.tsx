import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

/** The site root for a language: send people to where they belong. */
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const s = await getSession();
  if (!s) redirect(`/${locale}/login`);
  redirect(s.profile.role === "client" ? `/${locale}/portal` : `/${locale}/dashboard`);
}
