import { z } from "zod";
import { NextResponse } from "next/server";

/**
 * Request schemas — one per trust boundary.
 *
 * Nothing reaches a query until it has passed through here. The client is
 * never trusted for identity: where an employee id is accepted, the route
 * still checks the caller's authority before using it, and RLS refuses the
 * write regardless.
 */

const uuid = z.uuid({ message: "must be a UUID" });

export const LoginSchema = z.object({
  email: z.email({ message: "must be a valid email" }).max(160),
  password: z.string().min(8, "must be at least 8 characters").max(200),
});

export const DiscoverSchema = z.object({
  employeeId: uuid,
});

export const ExplainMatchSchema = z.object({
  roleId: uuid,
  employeeId: uuid,
});

export const RoadmapRequestSchema = z.object({
  roleId: uuid,
  employeeId: uuid,
});

export const AssistantSchema = z.object({
  message: z.string().trim().min(2, "say a little more").max(1000),
});

export const CommandTextSchema = z.object({
  command: z.string().trim().min(4, "say a little more").max(500),
});

/**
 * What the confirm step sends back.
 *
 * These ids came from the plan step, but they are re-resolved and re-checked
 * server side before anything is written — the confirmation is a human
 * approval, not a source of authority.
 */
export const CommandExecuteSchema = z.object({
  action: z.enum(["nominate_candidates", "close_role", "reopen_role"]),
  roleId: uuid,
  employeeIds: z.array(uuid).max(10).default([]),
  note: z.string().trim().min(1).max(500).nullable().default(null),
  summary: z.string().trim().min(1).max(600),
});

export type CommandExecuteInput = z.infer<typeof CommandExecuteSchema>;

export interface ParsedBody<T> {
  data?: T;
  error?: NextResponse;
}

/**
 * Parses and validates a JSON body, returning a 400 with field-level detail
 * rather than a generic failure — a client that gets told which field is wrong
 * can fix it.
 */
export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<ParsedBody<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      error: NextResponse.json(
        { error: "Request body must be JSON." },
        { status: 400 },
      ),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      error: NextResponse.json(
        {
          error: "Validation failed.",
          fields: result.error.issues.map((issue) => ({
            path: issue.path.join(".") || "(root)",
            message: issue.message,
          })),
        },
        { status: 400 },
      ),
    };
  }

  return { data: result.data };
}
