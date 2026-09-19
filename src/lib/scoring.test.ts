import { describe, expect, it } from "vitest";
import {
  effectiveLevel,
  rankCandidates,
  readinessOf,
  scoreMatch,
  type HeldSkill,
  type RequiredSkill,
} from "./scoring";

/**
 * The scoring rule is the only place in this app where a number is decided, so
 * it is the place that gets the tests. These pin the business rules a judge or
 * an employee would challenge: how confidence discounts an inference, that
 * over-performing one skill cannot hide a missing one, and that bad data
 * produces a defensible number rather than NaN.
 */

const sql: RequiredSkill = { skillId: "s1", name: "SQL", requiredLevel: 4, weight: 1.5 };
const python: RequiredSkill = { skillId: "s2", name: "Python", requiredLevel: 4, weight: 1.5 };
const docker: RequiredSkill = { skillId: "s3", name: "Docker", requiredLevel: 3, weight: 1 };

function held(
  skillId: string,
  name: string,
  level: number,
  confidence = 1,
  isHidden = false,
): HeldSkill {
  return { skillId, name, level, confidence, isHidden };
}

describe("effectiveLevel", () => {
  it("discounts an inferred skill by its confidence", () => {
    expect(effectiveLevel(held("s1", "SQL", 4, 0.5))).toBe(2);
  });

  it("leaves a fully confident skill untouched", () => {
    expect(effectiveLevel(held("s1", "SQL", 4, 1))).toBe(4);
  });

  it("treats a non-finite level as nothing rather than NaN", () => {
    expect(effectiveLevel(held("s1", "SQL", Number.NaN))).toBe(0);
    expect(effectiveLevel(held("s1", "SQL", 3, Number.NaN))).toBe(0);
  });

  it("clamps a level above the scale", () => {
    expect(effectiveLevel(held("s1", "SQL", 9))).toBe(5);
  });
});

describe("scoreMatch", () => {
  it("scores a perfect match at 100", () => {
    const result = scoreMatch(
      [sql, python, docker],
      [held("s1", "SQL", 5), held("s2", "Python", 4), held("s3", "Docker", 3)],
    );
    expect(result.score).toBe(100);
    expect(result.gaps).toHaveLength(0);
    expect(result.readiness).toBe("ready");
  });

  it("scores an empty profile at 0 and reports every requirement as a gap", () => {
    const result = scoreMatch([sql, python, docker], []);
    expect(result.score).toBe(0);
    expect(result.gaps).toHaveLength(3);
    expect(result.covered).toHaveLength(0);
  });

  it("weights requirements: missing a heavy skill costs more than a light one", () => {
    const missingHeavy = scoreMatch(
      [sql, docker],
      [held("s3", "Docker", 3)],
    );
    const missingLight = scoreMatch(
      [sql, docker],
      [held("s1", "SQL", 4)],
    );
    expect(missingLight.score).toBeGreaterThan(missingHeavy.score);
    // Docker alone: weight 1 of 2.5 total.
    expect(missingHeavy.score).toBe(40);
    // SQL alone: weight 1.5 of 2.5 total.
    expect(missingLight.score).toBe(60);
  });

  it("caps coverage at the required level, so exceeding one skill cannot mask a gap", () => {
    const result = scoreMatch(
      [sql, docker],
      [held("s1", "SQL", 5)], // level 5 against a required 4
    );
    expect(result.score).toBe(60);
  });

  it("applies confidence to the score, not just to the display", () => {
    const confident = scoreMatch([sql], [held("s1", "SQL", 4, 1)]);
    const unsure = scoreMatch([sql], [held("s1", "SQL", 4, 0.5)]);
    expect(confident.score).toBe(100);
    expect(unsure.score).toBe(50);
  });

  it("returns 0 for a role with no stated requirements instead of dividing by zero", () => {
    const result = scoreMatch([], [held("s1", "SQL", 5)]);
    expect(result.score).toBe(0);
    expect(Number.isNaN(result.score)).toBe(false);
  });

  it("treats a zero or negative weight as 1 rather than erasing the requirement", () => {
    const result = scoreMatch(
      [{ ...sql, weight: 0 }, { ...docker, weight: -3 }],
      [held("s1", "SQL", 4)],
    );
    expect(result.score).toBe(50);
  });

  it("orders gaps by deficit and weight, heaviest first", () => {
    const result = scoreMatch(
      [sql, python, docker],
      [held("s1", "SQL", 3), held("s2", "Python", 1), held("s3", "Docker", 2)],
    );
    expect(result.gaps.map((gap) => gap.name)).toEqual(["Python", "SQL", "Docker"]);
  });

  it("separates transferable skills, which is the whole point of discovery", () => {
    const result = scoreMatch(
      [sql, python],
      [held("s1", "SQL", 4), held("s2", "Python", 4, 0.9, true)],
    );
    expect(result.transferable.map((skill) => skill.name)).toEqual(["Python"]);
  });

  it("keeps the strongest evidence when a skill appears twice", () => {
    const result = scoreMatch(
      [sql],
      [held("s1", "SQL", 2), held("s1", "SQL", 5)],
    );
    expect(result.score).toBe(100);
  });

  it("does not flag a skill as a gap when it is within a quarter level", () => {
    const result = scoreMatch([docker], [held("s3", "Docker", 3, 0.95)]);
    expect(result.gaps).toHaveLength(0);
  });
});

describe("readinessOf", () => {
  it("maps the score bands", () => {
    expect(readinessOf(92)).toBe("ready");
    expect(readinessOf(85)).toBe("ready");
    expect(readinessOf(84.99)).toBe("strong");
    expect(readinessOf(70)).toBe("strong");
    expect(readinessOf(69)).toBe("stretch");
    expect(readinessOf(50)).toBe("stretch");
    expect(readinessOf(49.9)).toBe("developing");
    expect(readinessOf(0)).toBe("developing");
  });
});

describe("rankCandidates", () => {
  it("sorts by score and breaks ties alphabetically, so the order is stable", () => {
    const ranked = rankCandidates(
      [sql],
      [
        { id: "c1", name: "Zoe", held: [held("s1", "SQL", 4)] },
        { id: "c2", name: "Adam", held: [held("s1", "SQL", 4)] },
        { id: "c3", name: "Mia", held: [held("s1", "SQL", 2)] },
      ],
    );
    expect(ranked.map((candidate) => candidate.name)).toEqual(["Adam", "Zoe", "Mia"]);
  });

  it("includes candidates with no skills rather than dropping them", () => {
    const ranked = rankCandidates([sql], [{ id: "c1", name: "New Joiner", held: [] }]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].breakdown.score).toBe(0);
  });
});
