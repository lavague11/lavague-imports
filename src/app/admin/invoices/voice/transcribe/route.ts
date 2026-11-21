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
    // OpenAI selects the audio decoder from the FILENAME extension, so name the
    // file to match the real container. iPhone Safari records audio/mp4; desktop
    // Chrome records audio/webm — a hardcoded ".webm" on iOS audio makes OpenAI
    // try to decode MP4 as WebM and fail ("transcription failed").
    const type = (audio.type || "").toLowerCase();
    const ext =
      type.includes("mp4") ? "mp4"
      : type.includes("m4a") || type.includes("aac") ? "m4a"
      : type.includes("ogg") || type.includes("opus") ? "ogg"
      : type.includes("wav") ? "wav"
      : type.includes("mpeg") || type.includes("mp3") ? "mp3"
      : "webm";
    const file = await toFile(Buffer.from(await audio.arrayBuffer()), `order.${ext}`, {
      type: audio.type || "audio/webm",
    });
    const result = await client.audio.transcriptions.create({
      file,
      model: "gpt-transcribe", // OpenAI's recommended default; strong on bilingual AR/EN
      prompt: VOCAB,
      // language omitted on purpose → auto-detect (speakers mix Arabic + English)
      response_format: "json",
      // NOTE: do NOT add include:["logprobs"] here — that's only valid for the
      // gpt-4o-transcribe family and makes gpt-transcribe reject the whole request.
    });
    return NextResponse.json({ configured: true, text: result.text ?? "", confidence: null });
  } catch (error) {
    console.error("[voice] transcribe failed", error);
    return NextResponse.json({ configured: true, error: "failed" });
  }
}
