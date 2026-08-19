/** Shared between the wholesale form and its server action. */

export const BUSINESS_TYPES = [
  { value: "GROCERY", label: "Grocery / market" },
  { value: "RESTAURANT", label: "Restaurant" },
  { value: "CAFE", label: "Café / juice bar" },
  { value: "DISTRIBUTOR", label: "Distributor / wholesaler" },
  { value: "CATERER", label: "Caterer" },
  { value: "OTHER", label: "Other" },
] as const;

export const VOLUME_BANDS = [
  "Under $1,000",
  "$1,000 – $5,000",
  "$5,000 – $15,000",
  "$15,000+",
] as const;

export const PRODUCT_INTERESTS = [
  "Olive oil",
  "Beverages & water",
  "Spreads & sweets",
  "Seasonal / Ramadan allocation",
] as const;
