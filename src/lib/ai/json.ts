/**
 * Recovering JSON from a model response.
 *
 * Even with a JSON mime type requested, models wrap output in fences, prefix it
 * with "Here is the JSON:", or append a closing remark. Rather than failing the
 * request, pull the first balanced JSON value out of the text.
 *
 * Unit tested in src/lib/ai/json.test.ts — this is the kind of parsing that
 * silently rots, so it is pinned by tests.
 */

export class JsonRepairError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonRepairError";
  }
}

/** Strips ``` fences, with or without a language tag. */
export function stripCodeFences(raw: string): string {
  return raw
    .replace(/^﻿/, "")
    .replace(/```(?:json|JSON)?\s*/g, "")
    .replace(/```/g, "")
    .trim();
}

/**
 * Finds the first complete JSON object or array, respecting strings and
 * escapes so a brace inside a quoted value does not end the scan early.
 */
export function extractJsonSlice(text: string): string | null {
  const start = text.search(/[[{]/);
  if (start === -1) return null;

  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === opener) depth += 1;
    else if (char === closer) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

/**
 * Parses model output into unknown JSON. The caller is expected to validate
 * the result with Zod — this function only guarantees well-formed JSON, never
 * a correct shape.
 */
export function parseModelJson(raw: string): unknown {
  const cleaned = stripCodeFences(raw ?? "");
  if (!cleaned) throw new JsonRepairError("Model returned an empty response.");

  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through to slice extraction
  }

  const slice = extractJsonSlice(cleaned);
  if (!slice) {
    throw new JsonRepairError("No JSON value found in the model response.");
  }

  try {
    return JSON.parse(slice);
  } catch {
    // Trailing commas are the single most common remaining fault.
    const withoutTrailingCommas = slice.replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(withoutTrailingCommas);
    } catch (error) {
      throw new JsonRepairError(
        `Model response was not valid JSON: ${(error as Error).message}`,
      );
    }
  }
}
