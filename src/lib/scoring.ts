/**
 * Deterministic internal-mobility scoring.
 *
 * The number a judge, an employee and an HR partner all look at is computed
 * here — in plain arithmetic, with no model involved. The LLM is only ever
 * asked to *explain* a score it did not produce. Three reasons:
 *
 *   1. Rankings stay stable and reproducible between page loads.
 *   2. An LLM outage degrades the prose, never the shortlist.
 *   3. The rule can be unit tested, which a prompt cannot.
 *
 * See src/lib/scoring.test.ts.
 */

export interface RequiredSkill {
  skillId: string;
  name: string;
  /** 1–5 */
  requiredLevel: number;
  /** Relative importance, > 0. */
  weight: number;
}

export interface HeldSkill {
  skillId: string;
  name: string;
  /** 1–5 */
  level: number;
  /** 0–1. Declared skills are 1; AI-inferred skills carry the model's confidence. */
  confidence: number;
  isHidden: boolean;
}

export interface CoveredSkill {
  skillId: string;
  name: string;
  requiredLevel: number;
  effectiveLevel: number;
  coverage: number;
  weight: number;
  isHidden: boolean;
}

export interface SkillGap {
  skillId: string;
  name: string;
  requiredLevel: number;
  currentLevel: number;
  /** How much level is missing, rounded to one decimal. */
  deficit: number;
  weight: number;
}

export interface MatchBreakdown {
  /** 0–100, two decimals. */
  score: number;
  readiness: Readiness;
  covered: CoveredSkill[];
  gaps: SkillGap[];
  /** Covered skills the employee's job title would not have revealed. */
  transferable: CoveredSkill[];
}

export type Readiness = "ready" | "strong" | "stretch" | "developing";

/** A skill counts as a gap once more than a quarter of a level is missing. */
const GAP_EPSILON = 0.25;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Confidence discounts an inferred skill rather than excluding it: a skill the
 * model is 60% sure about should count for something, but not for as much as
 * one the employee stated outright.
 */
export function effectiveLevel(skill: HeldSkill): number {
  const level = clamp(skill.level, 0, 5);
  const confidence = clamp(skill.confidence, 0, 1);
  return round(level * confidence, 2);
}

export function readinessOf(score: number): Readiness {
  if (score >= 85) return "ready";
  if (score >= 70) return "strong";
  if (score >= 50) return "stretch";
  return "developing";
}

export const READINESS_LABEL: Record<Readiness, string> = {
  ready: "Ready now",
  strong: "Strong fit",
  stretch: "Stretch move",
  developing: "Developing",
};

/**
 * Weighted coverage of a role's requirements.
 *
 * score = 100 × Σ(weight × coverage) / Σ(weight)
 *
 * where coverage is the fraction of the required level the employee reaches,
 * capped at 1 — exceeding a requirement does not earn credit that offsets a
 * different missing skill.
 */
export function scoreMatch(
  required: RequiredSkill[],
  held: HeldSkill[],
): MatchBreakdown {
  const heldById = new Map<string, HeldSkill>();
  for (const skill of held) {
    const existing = heldById.get(skill.skillId);
    // Defensive: if the same skill arrives twice, the stronger evidence wins.
    if (!existing || effectiveLevel(skill) > effectiveLevel(existing)) {
      heldById.set(skill.skillId, skill);
    }
  }

  const covered: CoveredSkill[] = [];
  const gaps: SkillGap[] = [];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const requirement of required) {
    const requiredLevel = clamp(requirement.requiredLevel, 1, 5);
    const weight = Number.isFinite(requirement.weight) && requirement.weight > 0
      ? requirement.weight
      : 1;

    const match = heldById.get(requirement.skillId);
    const current = match ? effectiveLevel(match) : 0;
    const coverage = clamp(current / requiredLevel, 0, 1);

    weightedSum += weight * coverage;
    totalWeight += weight;

    if (current > 0) {
      covered.push({
        skillId: requirement.skillId,
        name: requirement.name,
        requiredLevel,
        effectiveLevel: current,
        coverage: round(coverage, 3),
        weight,
        isHidden: match?.isHidden ?? false,
      });
    }

    const deficit = requiredLevel - current;
    if (deficit > GAP_EPSILON) {
      gaps.push({
        skillId: requirement.skillId,
        name: requirement.name,
        requiredLevel,
        currentLevel: current,
        deficit: round(deficit, 1),
        weight,
      });
    }
  }

  // A role with no stated requirements cannot be scored. Returning 0 keeps it
  // out of a ranking rather than letting it sort to the top on an empty sum.
  const score = totalWeight === 0 ? 0 : round((weightedSum / totalWeight) * 100, 2);

  // Biggest, heaviest gaps first — that is the order a roadmap should address.
  gaps.sort((a, b) => b.deficit * b.weight - a.deficit * a.weight);
  covered.sort((a, b) => b.coverage * b.weight - a.coverage * a.weight);

  return {
    score,
    readiness: readinessOf(score),
    covered,
    gaps,
    transferable: covered.filter((skill) => skill.isHidden),
  };
}

/** Ranks candidates for a role, best first, with ties broken by name. */
export function rankCandidates<T extends { id: string; name: string; held: HeldSkill[] }>(
  required: RequiredSkill[],
  candidates: T[],
): Array<T & { breakdown: MatchBreakdown }> {
  return candidates
    .map((candidate) => ({ ...candidate, breakdown: scoreMatch(required, candidate.held) }))
    .sort((a, b) =>
      b.breakdown.score - a.breakdown.score || a.name.localeCompare(b.name),
    );
}
