import { z } from "zod";

/**
 * Schemas for everything a model returns.
 *
 * Model output is untrusted input. It crosses a trust boundary exactly like a
 * request body does, so it is validated with the same rigour before any of it
 * reaches Postgres.
 */

export const DiscoveredSkillSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(60),
  level: z.number().int().min(1).max(5),
  confidence: z.number().min(0).max(1),
  evidence: z.string().trim().min(1).max(600),
  is_hidden: z.boolean(),
});

export const DiscoverySchema = z.object({
  skills: z.array(DiscoveredSkillSchema).min(1).max(30),
  summary: z.string().trim().min(1).max(1200),
});

export type Discovery = z.infer<typeof DiscoverySchema>;
export type DiscoveredSkill = z.infer<typeof DiscoveredSkillSchema>;

export const MatchRationaleSchema = z.object({
  rationale: z.string().trim().min(1).max(2000),
  highlights: z.array(z.string().trim().min(1).max(200)).max(5).default([]),
});

export type MatchRationale = z.infer<typeof MatchRationaleSchema>;

export const RoadmapItemSchema = z.object({
  skill_name: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  provider: z.string().trim().min(1).max(80),
  url: z.string().trim().url().max(500).nullable().optional(),
  effort_hours: z.number().int().min(1).max(400),
  rationale: z.string().trim().min(1).max(600),
});

export const RoadmapSchema = z.object({
  items: z.array(RoadmapItemSchema).min(1).max(8),
});

export type RoadmapItem = z.infer<typeof RoadmapItemSchema>;

/**
 * The HR command plan.
 *
 * The model is allowed to interpret intent and name people and roles in prose.
 * It is never allowed to produce an id, a SQL statement, or a write. Names are
 * resolved to ids by the server, under the caller's own RLS, and the resulting
 * change is shown as a diff before anything is executed.
 */
export const CommandPlanSchema = z.object({
  action: z.enum(["nominate_candidates", "close_role", "reopen_role", "unsupported"]),
  role_title: z.string().trim().min(1).max(140).nullable(),
  employee_names: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
  top_n: z.number().int().min(1).max(10).nullable(),
  note: z.string().trim().min(1).max(500).nullable(),
  summary: z.string().trim().min(1).max(600),
});

export type CommandPlan = z.infer<typeof CommandPlanSchema>;
