import type { ZodError } from "zod";

export type FieldErrors = Record<string, string>;

export type FormState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: FieldErrors }
  | { status: "success"; message: string; reference: string };

export const idleFormState: FormState = { status: "idle" };

/**
 * Collapses a Zod error into one message per field. Built from `issues`
 * directly so it doesn't depend on Zod's shifting error-formatting helpers.
 */
export function toFieldErrors(error: ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/** Reads a trimmed string from FormData, returning undefined when blank. */
export function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function requiredString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
