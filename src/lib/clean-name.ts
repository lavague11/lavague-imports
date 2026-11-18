/**
 * The catalog naming rule (PRODUCTS_UI §13): Brand · Product · Size, e.g.
 * "Tayeb Pure Honey 1 kg". Deterministic and reversible — it only re-orders the
 * brand and size around the product core, it never invents words. Pure (safe in
 * client and server).
 */
export function suggestCleanName(name: string, brand?: string | null, size?: string | null): string {
  let core = (name || "").trim();
  const b = (brand || "").trim();
  const s = (size || "").trim();

  // Strip a leading brand ("Tayeb Pure Honey" → "Pure Honey").
  if (b && core.toLowerCase().startsWith(b.toLowerCase())) {
    core = core.slice(b.length).replace(/^[\s·,\-]+/, "").trim();
  }
  // Strip a trailing size token ("Pure Honey 1 kg" → "Pure Honey").
  if (s && core.toLowerCase().endsWith(s.toLowerCase())) {
    core = core.slice(0, core.length - s.length).replace(/[\s·,\-]+$/, "").trim();
  }

  const parts = [b, core, s].map((x) => x.trim()).filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** A loose key for duplicate matching: lowercased, brand+name+size, de-punctuated. */
export function nameKey(name: string, brand?: string | null, size?: string | null): string {
  return suggestCleanName(name, brand, size)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
