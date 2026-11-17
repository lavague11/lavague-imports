import { NextResponse } from "next/server";

import Anthropic from "@anthropic-ai/sdk";

import { requireAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import type { PrismaClient } from "@/generated/prisma/client";
import { getKey } from "@/lib/vault";

export const runtime = "nodejs";

// AI assist for invoice line items. Admin-only. Two modes:
//  - "cleanup": match the typed lines to our catalog and rewrite them professionally.
//  - "photo":   identify products from photos and build line items.
// Both return review rows the client shows in a table; nothing touches the invoice
// until the admin hits Apply. Needs ANTHROPIC_API_KEY (vault/env).

interface Candidate {
  name: string;
  brand: string | null;
  sku: string;
  priceCents: number | null;
}

interface Row {
  original: string;
  name: string;
  brand: string;
  sku: string;
  quantity: number;
  priceCents: number | null;
  matchTag: "exact" | "likely" | "no match";
}

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// Find up to `limit` catalog products whose name shares words with the query.
async function candidates(prisma: PrismaClient, query: string, limit = 6): Promise<Candidate[]> {
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3).slice(0, 6);
  if (tokens.length === 0) return [];
  const products = await prisma.product.findMany({
    where: { isActive: true, OR: tokens.map((t) => ({ name: { contains: t, mode: "insensitive" as const } })) },
    select: { name: true, brand: true, variants: { select: { sku: true, retailPriceCents: true }, take: 1 } },
    take: limit,
  });
  return products.map((p) => ({
    name: p.name,
    brand: p.brand,
    sku: p.variants[0]?.sku ?? "",
    priceCents: p.variants[0]?.retailPriceCents ?? null,
  }));
}

function parseJsonRows(text: string): unknown {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }

  const apiKey = getKey("ANTHROPIC_API_KEY") || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ configured: false });

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ configured: true, error: "db" });

  const fd = await request.formData();
  const mode = String(fd.get("mode") ?? "");
  const client = new Anthropic({ apiKey });

  try {
    if (mode === "cleanup") {
      const lines: { description: string; quantity: number }[] = JSON.parse(String(fd.get("lines") ?? "[]"));
      const clean = lines.filter((l) => l.description?.trim());
      if (clean.length === 0) return NextResponse.json({ configured: true, rows: [] });

      // Gather catalog candidates per line.
      const withCands = await Promise.all(
        clean.map(async (l) => ({ ...l, candidates: await candidates(prisma, l.description) })),
      );

      const prompt = `You are cleaning up the line items on a wholesale invoice for a North African / Middle Eastern grocery importer. For EACH input line, match it to the best catalog candidate if one clearly fits, and rewrite the item name professionally. Return ONLY a JSON array (no prose, no fences), one object per input line in the same order:
[{
  "original": string,      // the original typed text, unchanged
  "name": string,          // the matched catalog product name, or a clean professional rewrite if no match
  "brand": string,         // brand if known, else ""
  "sku": string,           // the matched catalog SKU, or "" if no match
  "quantity": number,      // keep the input quantity
  "priceCents": number|null, // the matched catalog price in cents, or null if no match
  "matchTag": "exact" | "likely" | "no match"
}]
Only use a SKU/price/brand from the provided candidates — never invent them. If nothing fits, matchTag "no match", sku "", priceCents null, but still give a clean professional name.

INPUT LINES (with catalog candidates):
${JSON.stringify(withCands, null, 1)}`;

      const msg = await client.messages.create({
        model: "claude-sonnet-5-5",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      });
      const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
      const rows = parseJsonRows(text);
      return NextResponse.json({ configured: true, rows: Array.isArray(rows) ? rows : [] });
    }

    if (mode === "photo") {
      const files = fd.getAll("image").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 4);
      if (files.length === 0) return NextResponse.json({ configured: true, rows: [] });

      const imageBlocks = await Promise.all(
        files.map(async (f) => {
          const mediaType = MEDIA_TYPES.includes(f.type) ? f.type : "image/jpeg";
          const data = Buffer.from(await f.arrayBuffer()).toString("base64");
          return { type: "image" as const, source: { type: "base64" as const, media_type: mediaType as "image/jpeg", data } };
        }),
      );

      const prompt = `These photos show grocery products to put on a wholesale invoice. Identify each distinct product and return ONLY a JSON array (no prose, no fences):
[{
  "name": string,      // product name including brand if visible
  "brand": string,     // brand only, "" if unknown
  "quantity": number,  // how many of this item are visible, best guess (default 1)
  "size": string       // size like "500 ml", "" if unknown
}]`;

      const msg = await client.messages.create({
        model: "claude-sonnet-5-5",
        max_tokens: 1500,
        messages: [{ role: "user", content: [...imageBlocks, { type: "text", text: prompt }] }],
      });
      const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
      const identified = parseJsonRows(text);
      if (!Array.isArray(identified)) return NextResponse.json({ configured: true, rows: [] });

      // Match each identified item to the catalog for sku/price.
      const rows: Row[] = await Promise.all(
        (identified as { name?: string; brand?: string; quantity?: number }[]).map(async (it) => {
          const name = (it.name ?? "").trim();
          const cands = await candidates(prisma, name, 1);
          const best = cands[0];
          return {
            original: [name, (it as { size?: string }).size].filter(Boolean).join(" ").trim() || name,
            name: best?.name || name,
            brand: best?.brand || it.brand || "",
            sku: best?.sku || "",
            quantity: Number.isFinite(it.quantity) && (it.quantity ?? 0) > 0 ? Math.round(it.quantity as number) : 1,
            priceCents: best?.priceCents ?? null,
            matchTag: best ? "likely" : "no match",
          };
        }),
      );
      return NextResponse.json({ configured: true, rows });
    }

    return NextResponse.json({ configured: true, rows: [] });
  } catch (error) {
    console.error("[invoice] assist failed", error);
    return NextResponse.json({ configured: true, error: "failed" });
  }
}
