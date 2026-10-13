import { NewPostPage } from "@/components/posts/new-post-page";
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ date?: string }> }) {
  return <NewPostPage locale={(await params).locale} portal searchParams={await searchParams} />;
}
