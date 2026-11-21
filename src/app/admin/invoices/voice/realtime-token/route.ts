import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { getKey } from "@/lib/vault";

export const runtime = "nodejs";

// Mints a SHORT-LIVED (~60s) ephemeral token for an OpenAI Realtime *transcription*
// session, so the browser can stream mic audio straight to OpenAI over a WebSocket
// without ever seeing the real key. Admin-only. The browser then connects to
// wss://api.openai.com/v1/realtime?intent=transcription and passes this token as a
// subprotocol. Tokens expire fast, so the client re-mints as needed.

// Bilingual vocabulary nudge (same spirit as the /transcribe prompt): brand/product
// names the model should recognise across Arabic scripts + English.
const VOCAB =
  "Wholesale grocery order in a mix of Egyptian, Moroccan and Algerian Arabic and English. " +
  "Likely brands/products: El Ouazzania (وزنية), Malsouka (ملسوكة), Sultan (سلطان), Chakour (شاكور), " +
  "Tayeb (طيب), Ideal (ايديال), extra virgin olive oil, harissa, couscous. Keep Arabic in Arabic.";

export async function POST() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }

  const apiKey = getKey("OPENAI_API_KEY") || process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ configured: false });

  try {
    // GA ephemeral-key endpoint (the older /realtime/transcription_sessions now 404s).
    // The session config is nested; the token comes back at top-level `value`.
    const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        session: {
          type: "transcription",
          audio: {
            input: {
              format: { type: "audio/pcm", rate: 24000 }, // 16-bit PCM, 24kHz, mono
              transcription: {
                model: "gpt-live-transcribe", // OpenAI's recommended streaming model
                prompt: VOCAB,
              },
              // gpt-live-transcribe has no server VAD — the client does its own VAD
              // and commits each turn, so disable server turn detection here.
              turn_detection: null,
            },
          },
        },
      }),
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      console.error("[voice] realtime token failed", res.status, detail);
      // Surface status + a short detail to the admin caller so a bad request body
      // (the docs have a few shape ambiguities) is diagnosable without server-log access.
      return NextResponse.json({ configured: true, error: "token", status: res.status, detail });
    }

    const data = (await res.json()) as { value?: string; expires_at?: number };
    const token = data.value ?? null;
    if (!token) return NextResponse.json({ configured: true, error: "token", detail: "no token value" });

    return NextResponse.json({
      configured: true,
      token,
      expiresAt: data.expires_at ?? null,
      model: "gpt-live-transcribe",
    });
  } catch (error) {
    console.error("[voice] realtime token error", error);
    return NextResponse.json({ configured: true, error: "token" });
  }
}
