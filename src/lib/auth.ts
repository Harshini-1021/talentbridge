import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Viewer {
  supabase: SupabaseClient;
  userId: string;
  profile: Profile;
  isHr: boolean;
}

/**
 * Resolves the caller, or null when there is no valid session.
 *
 * getUser() is used rather than getSession() because it revalidates the token
 * with Supabase instead of trusting a cookie the browser handed us.
 */
export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("tb_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle<Profile>();

  if (!profile) return null;

  return {
    supabase,
    userId: user.id,
    profile,
    isHr: profile.app_role === "hr",
  };
}

/** For pages: bounces anonymous visitors to the login screen. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  return viewer;
}

/** For HR-only pages. */
export async function requireHr(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!viewer.isHr) redirect("/dashboard");
  return viewer;
}
