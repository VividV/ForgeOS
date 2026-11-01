import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { publicEnv } from "@/lib/env";

/**
 * Supabase client bound to the signed-in user's session. Every query runs with
 * the user's JWT, so Row Level Security applies. Use this for all app data access.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const h = await headers();
  const requestId = h.get("x-request-id") ?? crypto.randomUUID();
  return createServerClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
    global: { headers: { "x-request-id": requestId } },
  });
}
