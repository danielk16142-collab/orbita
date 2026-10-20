import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client with the public anon key, used only to send a file to a signed upload URL that the server issued.
 * The signed token is what authorizes that one upload; this client carries no session and no secrets.
 */
export const supabaseBrowser = () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
