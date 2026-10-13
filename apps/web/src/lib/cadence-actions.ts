"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { resolveAgentActor } from "@/lib/agent/access";

/** Set the weekly posting goal. Anyone who can see the client may change it; the database policies decide. */
export async function setPostingGoalAction(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const p = z.object({ clientId: z.string().uuid().optional(), goal: z.number().int().min(1).max(21) }).safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const a = await resolveAgentActor(p.data.clientId);
  if (!a.ok) return { ok: false, error: "forbidden" };
  const { data, error } = await a.actor.sb.from("clients").update({ posting_goal: p.data.goal }).eq("id", a.actor.clientId).select("id");
  if (error) { console.error(`posting goal failed: code=${error.code}`); return { ok: false, error: ["PGRST204", "42703"].includes(error.code ?? "") ? "not_set_up" : "forbidden" }; }
  if (!data?.length) return { ok: false, error: "forbidden" };
  revalidatePath("/", "layout");
  return { ok: true };
}
