// Client-safe constants for invoice photos (no server-only imports).

export const PHOTO_KINDS = ["DELIVERY", "PAYMENT", "OTHER"] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

export function photoKindLabel(k: string): string {
  switch (k) {
    case "DELIVERY": return "Delivery";
    case "PAYMENT": return "Payment method";
    default: return "Other";
  }
}

export const PHOTO_KIND_BADGE: Record<string, string> = {
  DELIVERY: "bg-emerald-100 text-emerald-700",
  PAYMENT: "bg-sky-100 text-sky-800",
  OTHER: "bg-olive-100 text-olive-700",
};
