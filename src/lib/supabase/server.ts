import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Reads the public Supabase config.
 *
 * Deliberately resolved at call time rather than at module load: a missing
 * variable should surface as a clear runtime error on the affected request,
 * not as an opaque build failure on Vercel.
 */
export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return { url, key };
}

/**
 * Server-side Supabase client bound to the caller's session cookies.
 *
 * Every query made through this client runs as the signed-in user, so row
 * level security — not application code — decides what comes back. There is
 * no service-role client anywhere in this project.
 */
export async function createClient() {
  const { url, key } = supabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // proxy.ts refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
