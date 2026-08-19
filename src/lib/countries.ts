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
