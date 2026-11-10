import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { validDate } from "@orbita/content";
import { requireClientUser, requireStaff } from "@/lib/session";
import { CreatePostFlow } from "./create-post-flow";

/** "Create post": the agency picks the client; a client user creates for their own business. */
export async function NewPostPage({ locale, portal, searchParams }: { locale: string; portal: boolean; searchParams: { client?: string; date?: string; idea?: string; network?: string; lang?: string } }) {
  const t = await getTranslations("posts");
  const s = portal ? await requireClientUser(locale) : await requireStaff(locale);
  const { data: clients } = portal ? { data: [] as { id: string; name: string; languages: string[] }[] } : await s.sb.from("clients").select("id, name, languages").order("name");
  // The client's own languages (portal), so the post opens in its first language.
  const { data: own } = portal && s.profile.client_id ? await s.sb.from("clients").select("languages").eq("id", s.profile.client_id).maybeSingle() : { data: null };
  const postsBase = portal ? `/${locale}/portal/posts` : `/${locale}/posts`;
  const initialClient = (clients ?? []).some((c) => c.id === searchParams.client) ? searchParams.client! : "";
  return (
    <>
      <p className="eyebrow"><Link href={postsBase}>{t("title")}</Link></p>
      <h1>{t("createPost")}</h1>
      <CreatePostFlow locale={locale} staff={!portal} clients={clients ?? []} initialClient={initialClient}
        initialDate={validDate(searchParams.date) ? searchParams.date! : ""} initialIdea={(searchParams.idea ?? "").slice(0, 500)} initialNetwork={searchParams.network} initialLanguage={searchParams.lang} ownLanguages={(own?.languages as string[] | undefined) ?? undefined} postsBase={postsBase} agentBase={portal ? `/${locale}/portal/agent` : `/${locale}/agent`} />
    </>
  );
}
