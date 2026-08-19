/** Flag emoji per country, mirroring COUNTRY_FLAGS in scripts/build-catalog.mjs. */
export const COUNTRY_FLAGS: Record<string, string> = {
  Morocco: "🇲🇦",
  Algeria: "🇩🇿",
  Tunisia: "🇹🇳",
  Egypt: "🇪🇬",
  Turkey: "🇹🇷",
  Lebanon: "🇱🇧",
  Palestine: "🇵🇸",
  Syria: "🇸🇾",
  Jordan: "🇯🇴",
  Iraq: "🇮🇶",
  "Saudi Arabia": "🇸🇦",
  "United Arab Emirates": "🇦🇪",
  Yemen: "🇾🇪",
  Iran: "🇮🇷",
  Pakistan: "🇵🇰",
  India: "🇮🇳",
  Afghanistan: "🇦🇫",
  Greece: "🇬🇷",
  Italy: "🇮🇹",
  Spain: "🇪🇸",
  France: "🇫🇷",
  "United Kingdom": "🇬🇧",
  "United States": "🇺🇸",
};

export function flagFor(country: string | null | undefined): string {
  if (!country) return "";
  return COUNTRY_FLAGS[country] ?? "🌍";
}

/**
 * ISO 3166-1 alpha-2 codes, used to render real flag images (emoji flags don't
 * render on Windows/Chrome). Mirrors COUNTRY_FLAGS.
 */
export const COUNTRY_ISO: Record<string, string> = {
  Morocco: "ma",
  Algeria: "dz",
  Tunisia: "tn",
  Egypt: "eg",
  Turkey: "tr",
  Lebanon: "lb",
  Palestine: "ps",
  Syria: "sy",
  Jordan: "jo",
  Iraq: "iq",
  "Saudi Arabia": "sa",
  "United Arab Emirates": "ae",
  Yemen: "ye",
  Iran: "ir",
  Pakistan: "pk",
  India: "in",
  Afghanistan: "af",
  Greece: "gr",
  Italy: "it",
  Spain: "es",
  France: "fr",
  "United Kingdom": "gb",
  "United States": "us",
};

export function isoFor(country: string | null | undefined): string | null {
  if (!country) return null;
  return COUNTRY_ISO[country] ?? null;
}
