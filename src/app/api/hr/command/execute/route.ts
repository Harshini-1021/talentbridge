import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { CommandExecuteSchema, parseBody } from "@/lib/validation";
import { getNominations, getRole } from "@/lib/data";
import type { Profile } from "@/lib/types";

/**
 * F3b, step two of two — execute an approved plan.
 *
 * The ids in the body came from the plan step, but nothing here trusts them:
 * the role is re-fetched, the employees are re-checked, and every write runs
 * under the caller's RLS. The confirmation is a human approval, not a grant of
 * authority. No model is called on this path at all — by the time a write
 * happens, the LLM is out of the loop.
 */
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (!viewer.isHr) {
    return NextResponse.json(
      { error: "The command bar is available to HR administrators." },
      { status: 403 },
    );
  }

  const { data, error: badRequest } = await parseBody(request, CommandExecuteSchema);
  if (badRequest) return badRequest;

  const { supabase, userId } = viewer;
  const { action, roleId, employeeIds, note, summary } = data!;

  const role = await getRole(supabase, roleId);
  if (!role) return NextResponse.json({ error: "Role not found." }, { status: 404 });

  /* ---------------------------------------------------------------- */
  if (action === "close_role" || action === "reopen_role") {
    const nextOpen = action === "reopen_role";
    const before = { is_open: role.is_open };

    const { error } = await supabase
      .from("tb_roles")
      .update({ is_open: nextOpen })
      .eq("id", roleId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await writeAudit(supabase, {
      action: `role.${action}`,
      entity: "tb_roles",
      entityId: roleId,
      before,
      after: { is_open: nextOpen, instruction: summary },
    });

    return NextResponse.json({
      ok: true,
      message: `${role.title} is now ${nextOpen ? "open" : "closed"}.`,
    });
  }

  /* ---------------------------------------------------------------- */
  if (employeeIds.length === 0) {
    return NextResponse.json(
      { error: "No employees to nominate." },
      { status: 400 },
    );
  }

  // Re-check that every id is a real employee this HR user can see.
  const { data: targets, error: lookupError } = await supabase
    .from("tb_profiles")
    .select("user_id, full_name, app_role")
    .in("user_id", employeeIds);

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }

  const valid = ((targets ?? []) as Pick<Profile, "user_id" | "full_name" | "app_role">[])
    .filter((profile) => profile.app_role === "employee");

  if (valid.length !== employeeIds.length) {
    return NextResponse.json(
      { error: "One or more of those employees could not be verified." },
      { status: 422 },
    );
  }

  const before = await getNominations(supabase, { roleId });

  const { data: inserted, error } = await supabase
    .from("tb_nominations")
    .upsert(
      valid.map((profile) => ({
        employee_id: profile.user_id,
        role_id: roleId,
        status: "proposed" as const,
        note,
        created_by: userId,
      })),
      { onConflict: "employee_id,role_id", ignoreDuplicates: true },
    )
    .select("*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const after = await getNominations(supabase, { roleId });

  await writeAudit(supabase, {
    action: "nomination.create",
    entity: "tb_nominations",
    entityId: roleId,
    before: {
      count: before.length,
      employee_ids: before.map((nomination) => nomination.employee_id),
    },
    after: {
      count: after.length,
      employee_ids: after.map((nomination) => nomination.employee_id),
      added: valid.map((profile) => profile.full_name),
      instruction: summary,
    },
  });

  return NextResponse.json({
    ok: true,
    message: `Nominated ${valid.map((profile) => profile.full_name).join(", ")} for ${role.title}.`,
    created: inserted?.length ?? 0,
  });
}
