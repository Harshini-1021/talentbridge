/**
 * Row shapes for the tb_* tables.
 *
 * Hand-written rather than generated: the Supabase MCP could not reach this
 * project from the build environment, so `generate_typescript_types` was not
 * available. These mirror supabase/migrations/0001_schema.sql exactly.
 */

export type AppRole = "employee" | "hr";
export type ExperienceKind = "project" | "job" | "learning" | "achievement";
export type SkillSource = "declared" | "ai_inferred";
export type NominationStatus = "proposed" | "confirmed" | "rejected";
export type MessageRole = "user" | "assistant";

export interface Profile {
  user_id: string;
  full_name: string;
  email: string;
  app_role: AppRole;
  department: string;
  job_title: string;
  years_experience: number;
  created_at: string;
  updated_at: string;
}

export interface Experience {
  id: string;
  employee_id: string;
  kind: ExperienceKind;
  title: string;
  description: string;
  started_on: string | null;
  ended_on: string | null;
  created_at: string;
}

export interface Skill {
  id: string;
  name: string;
  category: string;
}

export interface EmployeeSkill {
  id: string;
  employee_id: string;
  skill_id: string;
  level: number;
  confidence: number;
  source: SkillSource;
  evidence: string | null;
  is_hidden: boolean;
  updated_at: string;
}

/** tb_employee_skills joined to its skill. */
export interface EmployeeSkillWithSkill extends EmployeeSkill {
  tb_skills: Skill | null;
}

export interface Role {
  id: string;
  title: string;
  department: string;
  description: string;
  is_open: boolean;
  created_by: string | null;
  created_at: string;
}

export interface RoleSkill {
  id: string;
  role_id: string;
  skill_id: string;
  required_level: number;
  weight: number;
}

export interface RoleSkillWithSkill extends RoleSkill {
  tb_skills: Skill | null;
}

export interface MatchRow {
  id: string;
  employee_id: string;
  role_id: string;
  score: number;
  rationale: string;
  gaps: unknown;
  model: string | null;
  created_at: string;
}

export interface LearningRec {
  id: string;
  employee_id: string;
  role_id: string | null;
  skill_id: string | null;
  skill_name: string;
  title: string;
  provider: string;
  url: string | null;
  effort_hours: number;
  rationale: string;
  created_at: string;
}

export interface Nomination {
  id: string;
  employee_id: string;
  role_id: string;
  status: NominationStatus;
  note: string | null;
  created_by: string;
  created_at: string;
}

export interface AssistantMessage {
  id: string;
  employee_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
}

export interface AuditRow {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  created_at: string;
}
