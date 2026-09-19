import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Appends to tb_audit_log.
 *
 * `actor` is deliberately not passed from here: the column defaults to
 * auth.uid() and the insert policy requires it to equal auth.uid(), so a caller
 * cannot write a row attributed to someone else even if this helper were
 * misused.
 *
 * Audit failure never fails the request it describes — but it is logged, so a
 * silently unaudited mutation is visible in the platform logs.
 */
export async function writeAudit(
  supabase: SupabaseClient,
  entry: {
    action: string;
    entity: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  const { error } = await supabase.from("tb_audit_log").insert({
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });

  if (error) {
    console.error("[audit] failed to record", entry.action, error.message);
  }
}
