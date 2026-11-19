import { NextResponse } from "next/server";

import OpenAI, { toFile } from "openai";

import { requireAdmin } from "@/lib/auth";
import { getKey } from "@/lib/vault";

export const runtime = "nodejs";
export const maxDuration = 60;

// TEMPORARY self-test: synthesize an order with OpenAI TTS, then run it through
// the SAME transcription the live mic uses (gpt-transcribe). Returns the
// transcript so the caller can post it to /match. Admin-only. Remove after use.
const VOCAB =
  "Wholesale grocery order spoken in Egyptian/Moroccan/Algerian Arabic and English. " +
  "Likely brands/products: El Ouazzania, Malsouka, Sultan, Tayeb, Ideal, Schweppes, Merendina, " +
  "olive oil (زيت زيتون), harissa, couscous. Transcribe exactly as spoken.";

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const key = getKey("OPENAI_API_KEY") || process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "no-key" });

  const body = (await request.json().catch(() => null)) as { text?: string; voice?: string } | null;
  const text = (body?.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "text" }, { status: 400 });

  const client = new OpenAI({ apiKey: key });
  let buf: Buffer | null = null;
  let ttsModel = "";
  for (const model of ["gpt-4o-mini-tts", "tts-1"]) {
    try {
      const speech = await client.audio.speech.create({ model, voice: body?.voice ?? "alloy", input: text });
      buf = Buffer.from(await speech.arrayBuffer());
      ttsModel = model;
      break;
    } catch {
      /* try next model */
    }
  }
  if (!buf) return NextResponse.json({ error: "tts-failed" });

  try {
    const file = await toFile(buf, "speech.mp3", { type: "audio/mpeg" });
    const result = await client.audio.transcriptions.create({ file, model: "gpt-transcribe", prompt: VOCAB });
    return NextResponse.json({ input: text, ttsModel, bytes: buf.length, transcript: result.text ?? "" });
  } catch (e) {
    return NextResponse.json({ error: "transcribe-failed", detail: String((e as Error)?.message || e) });
  }
}
