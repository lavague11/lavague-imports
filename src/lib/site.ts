export const site = {
  name: "La Vague Imports",
  shortName: "La Vague",
  tagline: "Specialty food importer — New York & New Jersey",
  description:
    "La Vague Imports brings Moroccan olive oil, Egyptian beverages, and North African specialty foods to retailers, restaurants, and homes across New York and New Jersey.",
  email: "Sales@lavagueimports.com",
  phone: "646-396-0775",
  phoneHref: "tel:+16463960775",
  address: {
    line1: "120 Industrial Ave",
    city: "Little Ferry",
    state: "NJ",
    postalCode: "07643",
  },
  social: {
    instagram: "https://www.instagram.com/lavagueimports/",
    facebook: "https://www.facebook.com/lavagueimports/",
  },
} as const;

export const navigation = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop" },
  { href: "/wholesale", label: "Wholesale" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

export const fullAddress = `${site.address.line1}, ${site.address.city}, ${site.address.state} ${site.address.postalCode}`;
