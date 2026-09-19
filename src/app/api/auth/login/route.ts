import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LoginSchema, parseBody } from "@/lib/validation";

/**
 * Credentialed sign-in, performed server side so the session cookie is set by
 * the server rather than assembled in the browser.
 *
 * The failure message is deliberately identical for an unknown address and a
 * wrong password — distinguishing them tells an attacker which addresses are
 * real.
 */
export async function POST(request: Request) {
  const { data, error: badRequest } = await parseBody(request, LoginSchema);
  if (badRequest) return badRequest;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: data!.email,
    password: data!.password,
  });

  if (error) {
    return NextResponse.json(
      { error: "That email and password do not match an account." },
      { status: 401 },
    );
  }

  // Where to land is decided here, from the membership table RLS itself
  // trusts, rather than being guessed by the browser.
  const { data: membership } = await supabase
    .from("tb_hr_admins")
    .select("user_id")
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    redirectTo: membership ? "/hr" : "/dashboard",
  });
}
