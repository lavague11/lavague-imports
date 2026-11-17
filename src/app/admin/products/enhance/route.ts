import { NextResponse } from "next/server";

import OpenAI, { toFile } from "openai";

import { requireAdmin } from "@/lib/auth";
import { getKey } from "@/lib/vault";

export const runtime = "nodejs";
export const maxDuration = 120; // image edits can take a while at high quality

// Two-tier product-photo clean-up with OpenAI's image models. Admin-only.
//  - tier "flare"    → gpt-image-2.6-flare, quality medium (quick clean-up)
//  - tier "sunburst" → gpt-image-2.6-sunburst, quality high (uses the user's feedback)
// Always edits the ORIGINAL photo the client sends; the client keeps the original
// file and only swaps it in on "Keep". Returns the result as a base64 data URL.

const BASE_PROMPT =
  "Professional e-commerce product photo, clean white studio background, soft even lighting, sharp focus, product centered. Do not change the product itself. Keep the label, text, logo, colors and shape exactly as they are.";

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }

  const apiKey = getKey("OPENAI_API_KEY") || process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ configured: false });

  const fd = await request.formData();
  const file = fd.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "no-image" }, { status: 400 });
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ configured: true, error: "too-large" });
  }

  const tier = String(fd.get("tier") ?? "flare") === "sunburst" ? "sunburst" : "flare";
  const feedback = String(fd.get("feedback") ?? "").trim().slice(0, 600);

  const model = tier === "sunburst" ? "gpt-image-2.6-sunburst" : "gpt-image-2.6-flare";
  const quality = tier === "sunburst" ? "high" : "medium";
  const prompt = tier === "sunburst" && feedback ? `${BASE_PROMPT} Fix this specifically: ${feedback}` : BASE_PROMPT;

  try {
    const client = new OpenAI({ apiKey });
    const image = await toFile(Buffer.from(await file.arrayBuffer()), "product.png", {
      type: file.type || "image/png",
    });
    const result = await client.images.edit({ model, image, prompt, quality });
    const b64 = result.data?.[0]?.b64_json;
    if (!b64) return NextResponse.json({ configured: true, error: "failed" });
    return NextResponse.json({ configured: true, image: `data:image/png;base64,${b64}`, tier });
  } catch (error) {
    console.error("[products] enhance failed", error);
    return NextResponse.json({ configured: true, error: "failed" });
  }
}
