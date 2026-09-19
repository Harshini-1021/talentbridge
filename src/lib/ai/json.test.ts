import { describe, expect, it } from "vitest";
import { extractJsonSlice, JsonRepairError, parseModelJson, stripCodeFences } from "./json";

/**
 * The JSON repair path is the least glamorous and most load-bearing code in the
 * AI layer: every model eventually wraps its output in something. These cases
 * are the ones observed in practice.
 */

describe("stripCodeFences", () => {
  it("removes a fenced block with a language tag", () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("removes a bare fence", () => {
    expect(stripCodeFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("strips a byte order mark", () => {
    expect(stripCodeFences('﻿{"a":1}')).toBe('{"a":1}');
  });
});

describe("extractJsonSlice", () => {
  it("finds an object buried in prose", () => {
    expect(extractJsonSlice('Sure! Here it is: {"a":1} Hope that helps.')).toBe('{"a":1}');
  });

  it("finds an array", () => {
    expect(extractJsonSlice("result: [1,2,3]")).toBe("[1,2,3]");
  });

  it("does not stop at a brace inside a string", () => {
    const input = '{"note":"use } carefully","ok":true}';
    expect(extractJsonSlice(input)).toBe(input);
  });

  it("handles an escaped quote before a closing brace", () => {
    const input = '{"note":"he said \\"done\\"","ok":true}';
    expect(extractJsonSlice(input)).toBe(input);
  });

  it("handles nested structures", () => {
    const input = '{"a":{"b":[1,{"c":2}]}}';
    expect(extractJsonSlice(`noise ${input} noise`)).toBe(input);
  });

  it("returns null when there is no JSON at all", () => {
    expect(extractJsonSlice("I cannot help with that.")).toBeNull();
  });

  it("returns null for an unterminated object", () => {
    expect(extractJsonSlice('{"a":1')).toBeNull();
  });
});

describe("parseModelJson", () => {
  it("parses clean JSON", () => {
    expect(parseModelJson('{"skills":[]}')).toEqual({ skills: [] });
  });

  it("parses fenced JSON", () => {
    expect(parseModelJson('```json\n{"score":91}\n```')).toEqual({ score: 91 });
  });

  it("parses JSON wrapped in an explanation", () => {
    expect(
      parseModelJson('Here is the analysis you asked for:\n{"score":72}\nLet me know.'),
    ).toEqual({ score: 72 });
  });

  it("repairs a trailing comma", () => {
    expect(parseModelJson('{"a":1,"b":2,}')).toEqual({ a: 1, b: 2 });
  });

  it("repairs a trailing comma in a nested array", () => {
    expect(parseModelJson('{"items":[1,2,],}')).toEqual({ items: [1, 2] });
  });

  it("throws a typed error on an empty response", () => {
    expect(() => parseModelJson("")).toThrow(JsonRepairError);
    expect(() => parseModelJson("   ")).toThrow(JsonRepairError);
  });

  it("throws a typed error when there is no JSON", () => {
    expect(() => parseModelJson("I am unable to answer that.")).toThrow(JsonRepairError);
  });

  it("throws a typed error on irreparable JSON", () => {
    expect(() => parseModelJson('{"a": }')).toThrow(JsonRepairError);
  });
});
