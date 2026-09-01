import "server-only";

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Central API-key vault. Stores integration keys as a JSON file on the server
 * disk (gitignored), so they can be managed from the developer portal without a
 * redeploy. `getKey()` reads the vault first, then falls back to environment
 * variables — so anything already in .env keeps working, and the vault
 * overrides it when set.
 *
 * Values are secrets. The file lives outside version control; the portal only
 * ever shows masked previews. AUTH_SECRET and DEV_PORTAL_PASSWORD are
 * deliberately NOT vault-managed — they bootstrap the vault's own lock and must
 * come from the environment.
 */

export type KeyKind = "secret" | "browser" | "config";

export interface KnownKey {
  name: string;
  label: string;
  description: string;
  kind: KeyKind;
  /** Provider console URL for the "Get key ↗" link. */
  getUrl?: string;
  group: string;
}

/** Keys the app knows how to use. Custom keys added in the portal live alongside. */
export const KNOWN_KEYS: KnownKey[] = [
  {
    name: "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
    label: "Google Maps / Places",
    description: "Browser key for the Maps Embed/JS API — warehouse map, future delivery zones.",
    kind: "browser",
    getUrl: "https://console.cloud.google.com/google/maps-apis/credentials",
    group: "Google",
  },
  {
    name: "GOOGLE_OAUTH_CLIENT_ID",
    label: "Google Sign-In — Client ID",
    description: '"Continue with Google" on login/apply (OAuth). Pairs with the secret below.',
    kind: "secret",
    getUrl: "https://console.cloud.google.com/apis/credentials",
    group: "Google",
  },
  {
    name: "GOOGLE_OAUTH_CLIENT_SECRET",
    label: "Google Sign-In — Client Secret",
    description: "Paired secret for the Google OAuth client above — server-side only.",
    kind: "secret",
    getUrl: "https://console.cloud.google.com/apis/credentials",
    group: "Google",
  },
  {
    name: "GOOGLE_CALENDAR_ID",
    label: "Google Calendar",
    description: "Target calendar id for pickup/delivery-window events.",
    kind: "config",
    getUrl: "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com",
    group: "Google",
  },
  {
    name: "RESEND_API_KEY",
    label: "Resend (email)",
    description: "Transactional email via Resend — quote/wholesale/contact notifications.",
    kind: "secret",
    getUrl: "https://resend.com/api-keys",
    group: "Email",
  },
  {
    name: "SMTP_PASS",
    label: "SMTP password",
    description: "Password for SMTP email (Hostinger, Gmail app password, etc.). Pairs with SMTP_HOST/USER.",
    kind: "secret",
    group: "Email",
  },
  {
    name: "MAIL_FROM",
    label: "Mail “from” address",
    description: 'Visible sender, e.g. "La Vague Imports <sales@lavagueimports.com>".',
    kind: "config",
    group: "Email",
  },
];

const KNOWN_BY_NAME = new Map(KNOWN_KEYS.map((k) => [k.name, k]));

interface StoredEntry {
  value: string;
  description?: string;
  updatedAt: string;
}
interface VaultFile {
  keys: Record<string, StoredEntry>;
}

function vaultPath(): string {
  return process.env.VAULT_PATH || join(process.cwd(), ".data", "api-vault.json");
}

function read(): VaultFile {
  try {
    const raw = readFileSync(vaultPath(), "utf8");
    const parsed = JSON.parse(raw) as VaultFile;
    return parsed && typeof parsed === "object" && parsed.keys ? parsed : { keys: {} };
  } catch {
    return { keys: {} };
  }
}

function write(data: VaultFile): void {
  const path = vaultPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), { mode: 0o600 });
}

/** The effective value for a key: vault first, then environment. */
export function getKey(name: string): string | undefined {
  const stored = read().keys[name]?.value;
  if (stored && stored.trim() !== "") return stored;
  const env = process.env[name];
  return env && env.trim() !== "" ? env : undefined;
}

export function hasKey(name: string): boolean {
  return getKey(name) !== undefined;
}

/** Where a key's current value comes from, for the UI. */
export type KeySource = "vault" | "env" | "unset";
export function keySource(name: string): KeySource {
  const stored = read().keys[name]?.value;
  if (stored && stored.trim() !== "") return "vault";
  const env = process.env[name];
  return env && env.trim() !== "" ? "env" : "unset";
}

function mask(value: string): string {
  if (!value) return "";
  const tail = value.slice(-4);
  return `${"•".repeat(Math.min(10, Math.max(4, value.length - 4)))}${tail}`;
}

export interface VaultView {
  name: string;
  label: string;
  description: string;
  kind: KeyKind;
  known: boolean;
  getUrl?: string;
  group: string;
  source: KeySource;
  masked: string | null;
  updatedAt: string | null;
}

/** The full list for the portal: known keys merged with any custom stored keys. */
export function listKeys(): VaultView[] {
  const file = read();
  const names = new Set<string>([...KNOWN_KEYS.map((k) => k.name), ...Object.keys(file.keys)]);
  const views: VaultView[] = [];
  for (const name of names) {
    const known = KNOWN_BY_NAME.get(name);
    const entry = file.keys[name];
    const src = keySource(name);
    const value = src === "vault" ? entry?.value : src === "env" ? process.env[name] : undefined;
    views.push({
      name,
      label: known?.label ?? name,
      description: entry?.description || known?.description || "Custom key.",
      kind: known?.kind ?? "custom" as KeyKind,
      known: Boolean(known),
      getUrl: known?.getUrl,
      group: known?.group ?? "Custom",
      source: src,
      masked: value ? mask(value) : null,
      updatedAt: entry?.updatedAt ?? null,
    });
  }
  // Group order: Google, Email, then Custom/others; stored first within a group.
  const groupRank = (g: string) => (g === "Google" ? 0 : g === "Email" ? 1 : 2);
  return views.sort(
    (a, b) =>
      groupRank(a.group) - groupRank(b.group) ||
      a.group.localeCompare(b.group) ||
      Number(b.source === "vault") - Number(a.source === "vault") ||
      a.label.localeCompare(b.label),
  );
}

export function upsertKey(name: string, value: string, description?: string): void {
  const clean = name.trim();
  if (!clean) throw new Error("key name required");
  const data = read();
  data.keys[clean] = {
    value,
    description: description?.trim() || data.keys[clean]?.description,
    updatedAt: new Date().toISOString(),
  };
  write(data);
}

/** Remove the stored value (reverts to the env fallback) but keep known slots visible. */
export function clearKey(name: string): void {
  const data = read();
  if (data.keys[name]) {
    delete data.keys[name];
    write(data);
  }
}

/** Delete a custom key entirely. For known keys this is the same as clear. */
export function deleteKey(name: string): void {
  clearKey(name);
}
