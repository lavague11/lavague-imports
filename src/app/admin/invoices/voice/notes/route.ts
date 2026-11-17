import { NextResponse } from "next/server";

import Anthropic from "@anthropic-ai/sdk";

import { requireAdmin } from "@/lib/auth";
import { getKey } from "@/lib/vault";

export const runtime = "nodejs";

// Clean up a dictated invoice note with Claude Sonnet: fix punctuation, grammar
// and tone, and translate Arabic to English — but keep the meaning, numbers and
// dates exactly. Admin-only. Returns only the cleaned text.

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }

  const apiKey = getKey("ANTHROPIC_API_KEY") || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ configured: false });

  const fd = await request.formData().catch(() => null);
  const text = String(fd?.get("text") ?? "").trim().slice(0, 4000);
  if (!text) return NextResponse.json({ configured: true, text: "" });

  const prompt = `Clean up this dictated note for a wholesale grocery invoice. Fix punctuation, capitalization and grammar, and give it a clear professional tone. Write it in English — translate any Arabic. Keep the meaning, and keep every number, price and date exactly as stated. Do not add information. Return ONLY the cleaned note text, with no preamble or quotes.

NOTE:
${text}`;

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });
    const out = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("").trim();
    return NextResponse.json({ configured: true, text: out || text });
  } catch (error) {
    console.error("[voice] notes cleanup failed", error);
    return NextResponse.json({ configured: true, error: "failed" });
  }
}
