import type { FocusEvent } from "react";

/**
 * Capitalize the first letter of each word in a person's or business name.
 * Deliberately gentle: it only upper-cases a word-initial letter that the user
 * typed in lower case, and never lower-cases anything. So "joe's deli" becomes
 * "Joe's Deli", "jean-pierre" becomes "Jean-Pierre", while "ARZ", "LLC" and
 * "NYC" are left intact. Internal whitespace is collapsed and the ends trimmed.
 *
 * Apostrophes are NOT word boundaries, so the possessive "Joe's" keeps its
 * lower-case s (far more common than "O'Brien"-style names).
 *
 * Not for product names (which carry their own casing, e.g. "7 Spice Mix").
 */
export function titleCaseName(input: string): string {
  const cleaned = input.replace(/\s+/g, " ").trim();
  // After the start, a space, hyphen or dot.
  return cleaned.replace(
    /(^|[\s\-.])([a-z])/g,
    (_m, sep: string, ch: string) => sep + ch.toUpperCase(),
  );
}

/** onBlur handler for an uncontrolled name <input>. Tidies the value in place. */
export function capitalizeNameOnBlur(e: FocusEvent<HTMLInputElement>) {
  const next = titleCaseName(e.currentTarget.value);
  if (next !== e.currentTarget.value) e.currentTarget.value = next;
}
