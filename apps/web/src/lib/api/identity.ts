import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/session";

/**
 * The identity of an API request (an agent's key acting as its own team member), visible to the app's access helpers
 * (getSession, sessionProblem, requireUser/Staff, resolveAgentActor, postActor, sameOrigin) for the duration of one
 * API call. It is only ever set by lib/api/auth after the key is verified; browser requests never have one. With it,
 * the app's own actions run for the agent exactly as for a team member, under row-level security.
 */
export type ApiIdentity = { sb: SupabaseClient; userId: string; profile: Profile; keyId: string; keyName: string; canPublish: boolean };
const store = new AsyncLocalStorage<ApiIdentity>();

export const apiIdentity = (): ApiIdentity | undefined => store.getStore();
export const runAsApi = <T>(identity: ApiIdentity, fn: () => Promise<T>): Promise<T> => store.run(identity, fn);
