export interface AddressParts {
  street?: string | null;
  unit?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  /// Legacy single-line fallback.
  address?: string | null;
}

/** Compose a one-line address from structured fields, falling back to legacy. */
export function composeAddress(c: AddressParts): string | null {
  if (c.street || c.city || c.state || c.zip) {
    const cityLine = [c.city, [c.state, c.zip].filter(Boolean).join(" ").trim()]
      .filter(Boolean)
      .join(", ");
    const line = [c.street, c.unit, cityLine].filter(Boolean).join(", ");
    return line || c.address || null;
  }
  return c.address || null;
}

/** A Google Maps search link — works with no API key. */
export function mapsUrl(c: AddressParts): string | null {
  const a = composeAddress(c);
  return a ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}` : null;
}

export function hasAddress(c: AddressParts): boolean {
  return Boolean(composeAddress(c));
}
