import { NextResponse } from "next/server";

import { clearKey, deleteKey, listKeys, upsertKey } from "@/lib/vault";
import { checkPassword, isUnlocked, lock, unlock, vaultLockConfigured } from "@/lib/vault-auth";

// GET — the vault state. Returns the (masked) key list only when unlocked.
export async function GET() {
  const configured = vaultLockConfigured();
  const unlocked = await isUnlocked();
  return NextResponse.json({
    configured,
    unlocked,
    keys: unlocked ? listKeys() : [],
  });
}

// POST — vault actions. `unlock` needs the passphrase; everything else needs an
// existing unlock.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    password?: string;
    name?: string;
    value?: string;
    description?: string;
  };
  const action = body.action;

  if (action === "unlock") {
    if (!vaultLockConfigured()) {
      return NextResponse.json({ error: "not-configured" }, { status: 503 });
    }
    if (!checkPassword(body.password ?? "")) {
      return NextResponse.json({ error: "wrong-password" }, { status: 401 });
    }
    await unlock();
    return NextResponse.json({ ok: true, keys: listKeys() });
  }

  if (action === "lock") {
    await lock();
    return NextResponse.json({ ok: true });
  }

  // All mutations below require an active unlock.
  if (!(await isUnlocked())) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }

  switch (action) {
    case "upsert": {
      if (!body.name || typeof body.value !== "string") {
        return NextResponse.json({ error: "name-and-value-required" }, { status: 400 });
      }
      upsertKey(body.name, body.value, body.description);
      return NextResponse.json({ ok: true, keys: listKeys() });
    }
    case "clear": {
      if (!body.name) return NextResponse.json({ error: "name-required" }, { status: 400 });
      clearKey(body.name);
      return NextResponse.json({ ok: true, keys: listKeys() });
    }
    case "delete": {
      if (!body.name) return NextResponse.json({ error: "name-required" }, { status: 400 });
      deleteKey(body.name);
      return NextResponse.json({ ok: true, keys: listKeys() });
    }
    default:
      return NextResponse.json({ error: "unknown-action" }, { status: 400 });
  }
}
