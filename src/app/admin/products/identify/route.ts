import { NextResponse } from "next/server";

import Anthropic from "@anthropic-ai/sdk";

import { requireAdmin } from "@/lib/auth";
import { getCategories } from "@/lib/catalog";
import { getKey } from "@/lib/vault";

export const runtime = "nodejs";

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type MediaType = (typeof MEDIA_TYPES)[number];

/**
 * Identify a product from a photo with Claude vision (Sonnet) and return
 * suggested form fields. Needs ANTHROPIC_API_KEY (vault or env); without it the
 * caller falls back to a plain manual form ({ configured: false }).
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }

  const apiKey = getKey("ANTHROPIC_API_KEY") || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ configured: false });

  const fd = await request.formData();
  const file = fd.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "no-image" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ configured: true, suggestion: null, error: "too-large" });
  }

  const mediaType: MediaType = (MEDIA_TYPES as readonly string[]).includes(file.type)
    ? (file.type as MediaType)
    : "image/jpeg";
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  const categories = await getCategories();
  const catList = categories.map((c) => `${c.slug} (${c.name})`).join(", ");

  const barcodeHint = String(fd.get("barcode") ?? "").replace(/[^0-9]/g, "");

  const prompt = `You are cataloguing a specialty North African / Middle Eastern grocery product from a photo for an importer. Identify the product and return ONLY a JSON object (no prose, no markdown fences) with exactly these fields:
{
  "name": string,                // product name, include the brand if visible
  "brand": string,               // brand/manufacturer only, "" if not visible
  "categorySlug": string,        // best match from these slugs, else "": ${catList}
  "origin": string,              // country of origin, "" if unknown
  "unitSizeAmount": string,      // numeric size only, e.g. "70", "1", "500"; "" if unknown
  "unitSizeUnit": string,        // one of: g, kg, ml, l, oz, lb, ct, piece; "" if unknown
  "piecesPerCase": number|null,  // pieces/units per case ONLY if a count is printed on the pack (e.g. "x12", "24 pcs"); else null
  "piecesPerCaseGuess": number|null, // if no count is printed, your best-guess case count; null if you truly cannot estimate
  "suggestedSku": string,        // short uppercase SKU in BRAND-PRODUCT-SIZE style, e.g. "SULTAN-HARISSA-200G"; always give a best effort
  "ribbon": string,              // short badge like "Best Seller" only if obvious, else ""
  "description": string,         // 1-2 appealing sentences for the storefront
  "fragile": boolean,            // true if the packaging is glass or otherwise breakable
  "confidence": number,          // 0 to 1, how confident you are in the identification
  "photoScore": number,          // 0 to 100: photo quality for e-commerce — sharpness, lighting, product fully in frame, label readable, clean background
  "photoNotes": string           // one short phrase on the photo, e.g. "sharp, label readable" or "blurry, partly cut off"
}
Never present a guess as a certainty: put a printed case count in "piecesPerCase" and an estimate in "piecesPerCaseGuess", never both.${barcodeHint ? ` The product's scanned barcode is ${barcodeHint}; you may use it for context but do not put it in the SKU.` : ""}`;

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) {
      return NextResponse.json({ configured: true, suggestion: null });
    }
    const suggestion = JSON.parse(text.slice(start, end + 1));
    return NextResponse.json({ configured: true, suggestion });
  } catch (error) {
    console.error("[products] identify failed", error);
    return NextResponse.json({ configured: true, suggestion: null, error: "failed" });
  }
}
