// Corrects country-of-origin where a product's NAME carries a strong signal for
// a country different from its current (often source-defaulted) origin. Only
// non-Moroccan signals are used, so the sensible Moroccan default for La Vague's
// own range is preserved; only clear foreign items (Turkish Torku, Algerian
// Hamoud/N'gaous, etc.) are reassigned. Writes durable ProductOverride.origin.
//
// Dry run (list changes):  DRY=1 node scripts/correct-origins.mjs
// Apply:                   node scripts/correct-origins.mjs
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client.js";

const DRY = process.env.DRY === "1";

// Strong, low-false-positive signals. Order matters: first match wins.
// NOTE: "greek" uses a lookbehind so it never fires on "fenuGREEK"; generic
// "italian"/"greek" adjectives are intentionally excluded (herb-blend names).
const SIGNALS = [
  ["Turkey", /\btorku\b|ülker|\bulker\b|şölen|\bsolen\b|tamek|\bturkish\b|\bturkey\b|türk|\bantep\b|\bmaras\b|pınar\b/i],
  ["Algeria", /\bhamoud\b|\brouiba\b|\bifri\b|n'?gaous|\bngaous\b|\bselecto\b|cevital|mordjene|\balgerian\b|\balgeria\b/i],
  ["Egypt", /\begyptian\b|\begypt\b|el doha/i],
  ["Saudi Arabia", /\bzamzam\b|almarai|alameed|\bsaudi\b/i],
  ["Syria", /\bsyrian\b|\baleppo\b|\bdamascus\b|holw el sham/i],
  ["Palestine", /\bpalestin|\bnabulsi\b|\bnablus\b/i],
  ["Lebanon", /\blebanese\b|\blebanon\b|\bcortas\b|chtoura|al wadi|\bbaalbek\b/i],
  ["Yemen", /\byemeni\b|\byemen\b/i],
  ["Greece", /\bkalamata\b|\bkrinos\b|(?<![a-z])greek\b/i],
  ["Pakistan", /\bpakistani?\b|\bshan\b|\blaziza\b|\btapal\b/i],
  ["India", /\bindian\b|\bindia\b|\bmdh\b|haldiram/i],
  ["Iran", /\biranian\b|\bpersian\b|\biran\b/i],
  ["Tunisia", /\btunisian\b|\btunisia\b|\bnabeul\b/i],
];

function signalOrigin(name) {
  const hay = ` ${name} `;
  for (const [country, re] of SIGNALS) if (re.test(hay)) return country;
  return null;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const products = await prisma.product.findMany({ select: { id: true, slug: true, name: true, origin: true } });

  const changes = [];
  for (const p of products) {
    const sig = signalOrigin(p.name);
    if (sig && sig !== p.origin) changes.push({ ...p, from: p.origin ?? "(none)", to: sig });
  }

  changes.sort((a, b) => `${a.to}`.localeCompare(b.to) || a.name.localeCompare(b.name));
  const byTo = {};
  for (const ch of changes) byTo[ch.to] = (byTo[ch.to] || 0) + 1;

  console.log(`${DRY ? "[DRY RUN] " : ""}${changes.length} origin corrections:`);
  console.log(Object.entries(byTo).map(([k, v]) => `  ${k}: ${v}`).join("\n"));
  console.log("\ndetail:");
  for (const ch of changes) console.log(`  ${ch.from} -> ${ch.to}   ${ch.name}`);

  if (!DRY) {
    for (const ch of changes) {
      await prisma.product.update({ where: { id: ch.id }, data: { origin: ch.to } });
      await prisma.productOverride.upsert({
        where: { slug: ch.slug },
        update: { origin: ch.to },
        create: { slug: ch.slug, origin: ch.to },
      });
    }
    console.log(`\nApplied ${changes.length} corrections.`);
  } else {
    console.log("\nNo changes written (DRY=1).");
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
