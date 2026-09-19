import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Next.js 16 renamed middleware to proxy (middleware.ts → proxy.ts,
 * config → proxyConfig).
 *
 * Its only job is to refresh the Supabase session cookie on every request, so
 * a Server Component never renders against an expired token. Authorisation is
 * not done here — pages call requireViewer()/requireHr(), and RLS backs both
 * of them at the database. A proxy that is the only gate is one bug away from
 * an open app.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Before the environment variables are set, let requests through so the app
  // can render its own configuration error instead of failing opaquely here.
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

export const proxyConfig = {
  matcher: [
    /*
     * Everything except static assets and image optimisation.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
