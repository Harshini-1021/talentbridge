import type { SupabaseClient } from "@supabase/supabase-js";
import type { HeldSkill, RequiredSkill } from "@/lib/scoring";
import type {
  EmployeeSkillWithSkill,
  Experience,
  LearningRec,
  MatchRow,
  Nomination,
  Profile,
  Role,
  RoleSkillWithSkill,
  Skill,
} from "@/lib/types";

/**
 * Every read in the app goes through here.
 *
 * Two rules hold throughout: the client is always the caller's session client
 * (so RLS decides what comes back), and related rows are fetched with a nested
 * select in one round trip rather than a query per row.
 */

export interface RoleWithSkills extends Role {
  tb_role_skills: RoleSkillWithSkill[];
}

export async function getSkillTaxonomy(supabase: SupabaseClient): Promise<Skill[]> {
  const { data, error } = await supabase
    .from("tb_skills")
    .select("*")
    .order("category")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Skill[];
}

export async function getExperiences(
  supabase: SupabaseClient,
  employeeId: string,
): Promise<Experience[]> {
  const { data, error } = await supabase
    .from("tb_experiences")
    .select("*")
    .eq("employee_id", employeeId)
    .order("started_on", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Experience[];
}

export async function getEmployeeSkills(
  supabase: SupabaseClient,
  employeeId: string,
): Promise<EmployeeSkillWithSkill[]> {
  const { data, error } = await supabase
    .from("tb_employee_skills")
    .select("*, tb_skills(*)")
    .eq("employee_id", employeeId)
    .order("level", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as EmployeeSkillWithSkill[];
}

/** One query for the whole organisation's skills — used by the HR views. */
export async function getAllEmployeeSkills(
  supabase: SupabaseClient,
): Promise<EmployeeSkillWithSkill[]> {
  const { data, error } = await supabase
    .from("tb_employee_skills")
    .select("*, tb_skills(*)");
  if (error) throw new Error(error.message);
  return (data ?? []) as EmployeeSkillWithSkill[];
}

export async function getOpenRoles(supabase: SupabaseClient): Promise<RoleWithSkills[]> {
  const { data, error } = await supabase
    .from("tb_roles")
    .select("*, tb_role_skills(*, tb_skills(*))")
    .eq("is_open", true)
    .order("title");
  if (error) throw new Error(error.message);
  return (data ?? []) as RoleWithSkills[];
}

export async function getAllRoles(supabase: SupabaseClient): Promise<RoleWithSkills[]> {
  const { data, error } = await supabase
    .from("tb_roles")
    .select("*, tb_role_skills(*, tb_skills(*))")
    .order("is_open", { ascending: false })
    .order("title");
  if (error) throw new Error(error.message);
  return (data ?? []) as RoleWithSkills[];
}

export async function getRole(
  supabase: SupabaseClient,
  roleId: string,
): Promise<RoleWithSkills | null> {
  const { data, error } = await supabase
    .from("tb_roles")
    .select("*, tb_role_skills(*, tb_skills(*))")
    .eq("id", roleId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RoleWithSkills | null) ?? null;
}

export async function getProfiles(supabase: SupabaseClient): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("tb_profiles")
    .select("*")
    .order("full_name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Profile[];
}

export async function getMatches(
  supabase: SupabaseClient,
  employeeId: string,
): Promise<MatchRow[]> {
  const { data, error } = await supabase
    .from("tb_matches")
    .select("*")
    .eq("employee_id", employeeId);
  if (error) throw new Error(error.message);
  return (data ?? []) as MatchRow[];
}

export async function getLearningRecs(
  supabase: SupabaseClient,
  employeeId: string,
  roleId?: string,
): Promise<LearningRec[]> {
  let query = supabase
    .from("tb_learning_recs")
    .select("*")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (roleId) query = query.eq("role_id", roleId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as LearningRec[];
}

export async function getNominations(
  supabase: SupabaseClient,
  filter: { employeeId?: string; roleId?: string } = {},
): Promise<Nomination[]> {
  let query = supabase
    .from("tb_nominations")
    .select("*")
    .order("created_at", { ascending: false });
  if (filter.employeeId) query = query.eq("employee_id", filter.employeeId);
  if (filter.roleId) query = query.eq("role_id", filter.roleId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Nomination[];
}

/* ------------------------------------------------------------------------ */
/* Adapters between database rows and the pure scoring functions             */
/* ------------------------------------------------------------------------ */

export function toHeldSkills(rows: EmployeeSkillWithSkill[]): HeldSkill[] {
  return rows
    .filter((row) => row.tb_skills !== null)
    .map((row) => ({
      skillId: row.skill_id,
      name: row.tb_skills!.name,
      level: Number(row.level),
      confidence: Number(row.confidence),
      isHidden: row.is_hidden,
    }));
}

export function toRequiredSkills(role: RoleWithSkills): RequiredSkill[] {
  return (role.tb_role_skills ?? [])
    .filter((row) => row.tb_skills !== null)
    .map((row) => ({
      skillId: row.skill_id,
      name: row.tb_skills!.name,
      requiredLevel: Number(row.required_level),
      weight: Number(row.weight),
    }));
}

/** Groups a flat organisation-wide skill fetch by employee. */
export function groupSkillsByEmployee(
  rows: EmployeeSkillWithSkill[],
): Map<string, HeldSkill[]> {
  const grouped = new Map<string, HeldSkill[]>();
  for (const held of toHeldSkillsWithOwner(rows)) {
    const list = grouped.get(held.employeeId) ?? [];
    list.push(held.skill);
    grouped.set(held.employeeId, list);
  }
  return grouped;
}

function toHeldSkillsWithOwner(rows: EmployeeSkillWithSkill[]) {
  return rows
    .filter((row) => row.tb_skills !== null)
    .map((row) => ({
      employeeId: row.employee_id,
      skill: {
        skillId: row.skill_id,
        name: row.tb_skills!.name,
        level: Number(row.level),
        confidence: Number(row.confidence),
        isHidden: row.is_hidden,
      } satisfies HeldSkill,
    }));
}
