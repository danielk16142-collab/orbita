"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { postError } from "./shared";
import { deletePostAction } from "@/lib/posts-actions";

/** A small ✕ next to a post on the calendar: deletes it after a confirmation (the server refuses published posts and past weeks). */
export function DeletePostButton({ postId, title }: { postId: string; title: string }) {
  const t = useTranslations("posts");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" className="chip-delete" disabled={pending} aria-label={t("deleteNamed", { title })} title={t("deletePost")}
      onClick={() => {
        if (!window.confirm(t("confirmDeleteNamed", { title }))) return;
        start(async () => {
          const r = await deletePostAction({ postId });
          if (r.ok) router.refresh();
          else window.alert(postError(t, r));
        });
      }}>{pending ? "…" : "✕"}</button>
  );
}
