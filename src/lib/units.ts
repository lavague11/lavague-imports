/**
 * Unit-size helpers shared by the admin forms (client) and the save/create
 * handlers (server). A variant's size label (e.g. "70 g") is entered as a
 * number + a unit picked from a dropdown, and stored as the combined string in
 * ProductVariant.name.
 */

export interface UnitOption {
  value: string;
  label: string;
}

/** The unit choices offered in the dropdown. `""` = no unit (e.g. "Each"). */
export const UNIT_OPTIONS: UnitOption[] = [
  { value: "g", label: "g — grams" },
  { value: "kg", label: "kg — kilograms" },
  { value: "oz", label: "oz — ounces" },
  { value: "lb", label: "lb — pounds" },
  { value: "ml", label: "ml — millilitres" },
  { value: "L", label: "L — litres" },
  { value: "ct", label: "ct — count / pieces" },
];

const UNIT_VALUES = new Set(UNIT_OPTIONS.map((u) => u.value));

// Maps common spellings/casings to a canonical unit value.
const UNIT_ALIASES: Record<string, string> = {
  g: "g", gram: "g", grams: "g", gr: "g",
  kg: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  oz: "oz", ounce: "oz", ounces: "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  ml: "ml", milliliter: "ml", millilitre: "ml", milliliters: "ml", millilitres: "ml",
  l: "L", liter: "L", litre: "L", liters: "L", litres: "L",
  ct: "ct", count: "ct", pc: "ct", pcs: "ct", piece: "ct", pieces: "ct", pack: "ct", ea: "ct",
};

/** Splits a stored label into an amount string and a canonical unit value.
 *  Falls back to putting the whole label in `amount` with an empty unit so
 *  nothing is lost for non-numeric names like "Each". */
export function parseUnitSize(name: string | null | undefined): { amount: string; unit: string } {
  const raw = (name ?? "").trim();
  if (!raw) return { amount: "", unit: "" };
  const m = /^([0-9]+(?:[.,][0-9]+)?)\s*([a-zA-Z]+)?/.exec(raw);
  if (!m) return { amount: raw, unit: "" };
  const amount = m[1];
  const unitRaw = (m[2] ?? "").toLowerCase();
  const unit = UNIT_ALIASES[unitRaw] ?? (UNIT_VALUES.has(m[2] ?? "") ? (m[2] as string) : "");
  return { amount, unit };
}

/** Recombines an amount + unit into a label. Returns null when both are empty. */
export function formatUnitSize(amount: string | null | undefined, unit: string | null | undefined): string | null {
  const a = (amount ?? "").trim();
  const u = (unit ?? "").trim();
  if (!a && !u) return null;
  if (!a) return u || null;
  return u ? `${a} ${u}` : a;
}
