import { NewPostPage } from "@/components/posts/new-post-page";
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ client?: string; date?: string; idea?: string }> }) {
  return <NewPostPage locale={(await params).locale} portal={false} searchParams={await searchParams} />;
}
