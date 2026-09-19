import { parseModelJson } from "./json";
import type { ZodType } from "zod";

/**
 * The model ladder.
 *
 * Two Gemini models before Groq: a second model on the same key recovers from a
 * burst limit or a model-specific fault without depending on a second vendor's
 * key still being valid. Each rung gets a tight timeout so the whole ladder
 * finishes inside the route's 60s budget — a rung that hangs until the platform
 * kills the function looks exactly like "every provider is down".
 */
const RUNG_TIMEOUT_MS = 8_000;

export interface ModelResult {
  text: string;
  model: string;
}

export class AiUnavailableError extends Error {
  readonly attempts: string[];
  constructor(attempts: string[]) {
    super("No AI provider answered.");
    this.name = "AiUnavailableError";
    this.attempts = attempts;
  }
}

interface Rung {
  id: string;
  run: (prompt: string, json: boolean, signal: AbortSignal) => Promise<string>;
}

function geminiRung(model: string): Rung {
  return {
    id: model,
    async run(prompt, json, signal) {
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error("GEMINI_API_KEY is not set");

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          signal,
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 2048,
              ...(json ? { responseMimeType: "application/json" } : {}),
            },
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`${model} returned ${response.status}`);
      }

      const body = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = body.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim();

      if (!text) throw new Error(`${model} returned no text`);
      return text;
    },
  };
}

const groqRung: Rung = {
  id: "llama-3.3-70b-versatile",
  async run(prompt, json, signal) {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error("GROQ_API_KEY is not set");

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(`groq returned ${response.status}`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = body.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("groq returned no text");
    return text;
  },
};

const LADDER: Rung[] = [
  geminiRung("gemini-flash-latest"),
  geminiRung("gemini-3.1-flash-lite"),
  groqRung,
];

export function aiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY);
}

/** Walks the ladder until a rung answers. */
export async function generateText(
  prompt: string,
  options: { json?: boolean } = {},
): Promise<ModelResult> {
  const attempts: string[] = [];

  for (const rung of LADDER) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RUNG_TIMEOUT_MS);
    try {
      const text = await rung.run(prompt, options.json ?? false, controller.signal);
      return { text, model: rung.id };
    } catch (error) {
      attempts.push(`${rung.id}: ${(error as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new AiUnavailableError(attempts);
}

/**
 * Generates JSON and validates it against a schema before it reaches any
 * caller. The model's output is treated as untrusted input like any other
 * request body — a hallucinated field never reaches the database.
 */
export async function generateJson<T>(
  prompt: string,
  schema: ZodType<T>,
): Promise<{ data: T; model: string }> {
  const { text, model } = await generateText(prompt, { json: true });
  const parsed = parseModelJson(text);
  const result = schema.safeParse(parsed);

  if (!result.success) {
    throw new Error(
      `Model output failed validation: ${result.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`)
        .join("; ")}`,
    );
  }

  return { data: result.data, model };
}
