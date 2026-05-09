import type { ZodError, ZodType } from "zod";

import { AppError } from "../middleware/errorHandler";

export function formatZod(e: ZodError): string {
  return e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
}

export function parseBody<T>(schema: ZodType<T>, raw: unknown): T {
  const r = schema.safeParse(raw);
  if (!r.success) {
    throw new AppError("VALIDATION_ERROR", formatZod(r.error), 400);
  }
  return r.data;
}

export function parseQuery<T>(schema: ZodType<T>, raw: unknown): T {
  const r = schema.safeParse(raw);
  if (!r.success) {
    throw new AppError("VALIDATION_ERROR", formatZod(r.error), 400);
  }
  return r.data;
}
