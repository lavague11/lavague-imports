import { NextResponse } from "next/server";

import OpenAI, { toFile } from "openai";

import { requireAdmin } from "@/lib/auth";
import { getKey } from "@/lib/vault";

export const runtime = "nodejs";
export const maxDuration = 60;

// Speech-to-text for the invoice "Speak" button. Admin-only. Record → process
// (the robust fallback; live streaming is a later stage). Language is auto-detected
// (never forced), and a vocabulary hint nudges our brand/product names in both scripts.

const VOCAB =
  "Wholesale grocery order spoken in a mix of Egyptian, Moroccan and Algerian Arabic and English. " +
  "Likely brands and products: El Ouazzania (وزنية), Malsouka (ملسوكة), Sultan (سلطان), Chakour (شاكور), " +
  "Tayeb (طيب), Ideal (ايديال), extra virgin olive oil, harissa, couscous, 4011. " +
  "Transcribe exactly as spoken, keeping Arabic in Arabic and English in English.";

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }

  const apiKey = getKey("OPENAI_API_KEY") || process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ configured: false });

  const fd = await request.formData();
  const audio = fd.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "no-audio" }, { status: 400 });
  }
  if (audio.size > 25 * 1024 * 1024) {
    return NextResponse.json({ configured: true, error: "too-large" });
  }

  try {
    const client = new OpenAI({ apiKey });
    const file = await toFile(Buffer.from(await audio.arrayBuffer()), "order.webm", {
      type: audio.type || "audio/webm",
    });
    const result = await client.audio.transcriptions.create({
      file,
      model: "gpt-transcribe", // current model; gpt-4o-transcribe is being retired
      prompt: VOCAB,
      // language omitted on purpose → auto-detect (speakers mix Arabic + English)
      response_format: "json",
    });
    return NextResponse.json({ configured: true, text: result.text ?? "" });
  } catch (error) {
    console.error("[voice] transcribe failed", error);
    return NextResponse.json({ configured: true, error: "failed" });
  }
}
