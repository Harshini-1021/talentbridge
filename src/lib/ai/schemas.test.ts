import { describe, expect, it } from "vitest";
import { CommandPlanSchema, DiscoverySchema, RoadmapSchema } from "./schemas";

/**
 * Model output is validated exactly like a request body. These tests prove the
 * schemas actually reject the plausible-looking wrong answers a model produces
 * — an out-of-range level, a confidence expressed as a percentage, an invented
 * action — rather than letting them reach Postgres and fail a CHECK constraint
 * at 2am.
 */

const validSkill = {
  name: "SQL",
  category: "Data & Analytics",
  level: 4,
  confidence: 0.9,
  evidence: "Rebuilt the cohort model finance closes on.",
  is_hidden: false,
};

describe("DiscoverySchema", () => {
  it("accepts a well-formed discovery", () => {
    const result = DiscoverySchema.safeParse({
      summary: "Strong analyst with production engineering habits.",
      skills: [validSkill],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a level outside 1-5", () => {
    expect(
      DiscoverySchema.safeParse({
        summary: "ok",
        skills: [{ ...validSkill, level: 7 }],
      }).success,
    ).toBe(false);
  });

  it("rejects a fractional level", () => {
    expect(
      DiscoverySchema.safeParse({
        summary: "ok",
        skills: [{ ...validSkill, level: 3.5 }],
      }).success,
    ).toBe(false);
  });

  it("rejects a confidence given as a percentage", () => {
    expect(
      DiscoverySchema.safeParse({
        summary: "ok",
        skills: [{ ...validSkill, confidence: 90 }],
      }).success,
    ).toBe(false);
  });

  it("rejects a skill with no evidence, which is the whole guarantee", () => {
    expect(
      DiscoverySchema.safeParse({
        summary: "ok",
        skills: [{ ...validSkill, evidence: "" }],
      }).success,
    ).toBe(false);
  });

  it("rejects an empty skill list", () => {
    expect(DiscoverySchema.safeParse({ summary: "ok", skills: [] }).success).toBe(false);
  });
});

describe("RoadmapSchema", () => {
  const item = {
    skill_name: "Apache Airflow",
    title: "Airflow: the hands-on guide",
    provider: "Udemy",
    effort_hours: 20,
    rationale: "Covers DAG authoring and retries.",
  };

  it("accepts an item without a url", () => {
    expect(RoadmapSchema.safeParse({ items: [item] }).success).toBe(true);
  });

  it("accepts an explicit null url", () => {
    expect(RoadmapSchema.safeParse({ items: [{ ...item, url: null }] }).success).toBe(true);
  });

  it("rejects a url that is not a url", () => {
    expect(
      RoadmapSchema.safeParse({ items: [{ ...item, url: "coursera" }] }).success,
    ).toBe(false);
  });

  it("rejects an absurd effort estimate", () => {
    expect(
      RoadmapSchema.safeParse({ items: [{ ...item, effort_hours: 5000 }] }).success,
    ).toBe(false);
  });

  it("rejects zero hours", () => {
    expect(
      RoadmapSchema.safeParse({ items: [{ ...item, effort_hours: 0 }] }).success,
    ).toBe(false);
  });
});

describe("CommandPlanSchema", () => {
  const plan = {
    action: "nominate_candidates",
    role_title: "Data Platform Engineer",
    employee_names: [],
    top_n: 3,
    note: null,
    summary: "Nominate the three best candidates.",
  };

  it("accepts a supported action", () => {
    expect(CommandPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("defaults employee_names when the model omits it", () => {
    const { employee_names: _omitted, ...withoutNames } = plan;
    const result = CommandPlanSchema.safeParse(withoutNames);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.employee_names).toEqual([]);
  });

  it("rejects an action the model invented", () => {
    expect(
      CommandPlanSchema.safeParse({ ...plan, action: "delete_employee" }).success,
    ).toBe(false);
  });

  it("rejects a shortlist larger than the cap", () => {
    expect(CommandPlanSchema.safeParse({ ...plan, top_n: 500 }).success).toBe(false);
  });
});
