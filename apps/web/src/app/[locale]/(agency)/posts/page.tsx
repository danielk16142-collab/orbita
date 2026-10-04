import { PostsPage } from "@/components/posts/posts-page";
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { locale } = await params;
  return <PostsPage locale={locale} searchParams={await searchParams} portal={false} />;
}
