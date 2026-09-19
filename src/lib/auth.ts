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

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from("tb_profiles").select("*").eq("user_id", user.id).maybeSingle<Profile>(),
    // Authority comes from the membership table, which has no insert policy and
    // is not writable from any client — never from tb_profiles.app_role, which
    // is an ordinary column on a row the user can update. Deriving the UI gate
    // from the same table RLS trusts means the two can never disagree.
    supabase.from("tb_hr_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);

  if (!profile) return null;

  return {
    supabase,
    userId: user.id,
    profile,
    isHr: membership !== null,
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
