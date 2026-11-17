// Alias table: Arabic / English / common misspellings → catalog search terms.
// Seeded from the spec; the rows in product_name_mapping.xlsx can be imported here later.
// Used to seed catalog candidate search for voice + photo item matching.

export const PRODUCT_ALIASES: Record<string, string> = {
  // بلبولة / belboula → Dari Barley Couscous
  "بلبولة": "barley couscous",
  belboula: "barley couscous",
  bolbola: "barley couscous",
  // وزنية / wazneya → El Ouazzania extra virgin olive oil (case of 6)
  "وزنية": "ouazzania extra virgin olive oil",
  wazneya: "ouazzania extra virgin olive oil",
  ouazzania: "ouazzania extra virgin olive oil",
  // المغربية / Maghribya → Al Maghribya
  "المغربية": "al maghribya",
  maghribya: "al maghribya",
  // داري / Dari
  "داري": "dari",
  dari: "dari",
  // other known brands
  "ملسوكة": "malsouka",
  malsouka: "malsouka",
  "سلطان": "sultan",
  "شاكور": "chakour",
  "طيب": "tayeb",
  "ايديال": "ideal",
  "إيديال": "ideal",
  // generic words that help matching
  "زيت": "oil",
  "زيتون": "olive",
  "كسكس": "couscous",
  "هريسة": "harissa",
};

/** English search terms contributed by any aliases present in the text, plus its Latin tokens. */
export function searchTermsFor(text: string): string[] {
  const latin = (text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
  const aliased: string[] = [];
  for (const [alias, term] of Object.entries(PRODUCT_ALIASES)) {
    if (text.toLowerCase().includes(alias.toLowerCase())) aliased.push(...term.split(" "));
  }
  return [...new Set([...latin, ...aliased])].filter((t) => t.length >= 3);
}
