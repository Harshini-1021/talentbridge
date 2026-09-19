"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client. Only ever sees the publishable key, which is public by
 * definition — all authority comes from RLS on the session's JWT.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase is not configured for the browser client.");
  }

  return createBrowserClient(url, key);
}
