import { PostDetail } from "@/components/posts/post-detail";
export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  return <PostDetail locale={locale} id={id} portal={true} />;
}
