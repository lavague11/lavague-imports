import { NextResponse } from "next/server";

import { createSession, verifyPassword } from "@/lib/auth";
import { requirePrisma } from "@/lib/db";

// Login as a full-page POST → HTTP redirect (Post/Redirect/Get), NOT a Server
// Action. On this host server-action redirects re-render through the client
// error boundary ("This page couldn't load"); a plain form POST + 303 avoids
// that path entirely. Locations are relative so they resolve against the public
// URL rather than the proxy's internal origin (https://0.0.0.0:3000).

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/admin") ? next : "/admin";
}

function redirectTo(pathAndQuery: string) {
  return new NextResponse(null, { status: 303, headers: { Location: pathAndQuery } });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));

  const fail = (code: string) => {
    const params = new URLSearchParams({ error: code });
    if (next !== "/admin") params.set("next", next);
    return redirectTo(`/admin/login?${params.toString()}`);
  };

  try {
    const prisma = requirePrisma();
    const user = await prisma.adminUser.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return fail("invalid");
    }
    await createSession(user.id);
  } catch {
    return fail("db");
  }

  return redirectTo(next);
}
