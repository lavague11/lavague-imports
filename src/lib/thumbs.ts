import { readFile } from "node:fs/promises";
import path from "node:path";

import { Jimp } from "jimp";

import type { getPrisma } from "@/lib/db";

type Prisma = NonNullable<ReturnType<typeof getPrisma>>;

function detectType(bytes: Uint8Array): "png" | "jpg" | null {
  if (bytes.length < 4) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null; // webp/gif — jimp can't read these reliably
}

/** Load the raw bytes for an image url: DB media, local public file, or remote. */
async function loadRaw(url: string, prisma: Prisma): Promise<Uint8Array | null> {
  try {
    if (url.startsWith("/media/")) {
      const asset = await prisma.mediaAsset.findUnique({ where: { id: url.slice("/media/".length) }, select: { data: true } });
      return asset ? new Uint8Array(asset.data) : null;
    }
    if (url.startsWith("/")) {
      const buf = await readFile(path.join(process.cwd(), "public", url.replace(/^\//, "")));
      return new Uint8Array(buf);
    }
    if (/^https?:\/\//i.test(url)) {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
      return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Resize raw image bytes to a small JPEG thumbnail. Null if unreadable. */
async function makeThumb(bytes: Uint8Array): Promise<Uint8Array | null> {
  const type = detectType(bytes);
  if (!type) return null;
  if (type === "jpg" && bytes.length < 24_000) return bytes; // already tiny, no alpha
  try {
    const img = await Jimp.read(Buffer.from(bytes));
    if (img.width > 240) img.resize({ w: 240 });
    // Flatten onto white — otherwise transparent PNGs render on black in JPEG.
    const canvas = new Jimp({ width: img.width, height: img.height, color: 0xffffffff });
    canvas.composite(img, 0, 0);
    const out = await canvas.getBuffer("image/jpeg", { quality: 58 });
    return new Uint8Array(out);
  } catch {
    return null;
  }
}

/**
 * Returns a cached JPEG thumbnail for an image url, generating and storing it on
 * a cache miss. This is what makes repeat catalog builds fast — images are
 * resized once, then read straight from the DB.
 */
export async function getThumb(url: string | null, prisma: Prisma): Promise<{ bytes: Uint8Array; type: "jpg" } | null> {
  if (!url) return null;
  const cached = await prisma.imageThumb.findUnique({ where: { key: url }, select: { data: true } }).catch(() => null);
  if (cached) return { bytes: new Uint8Array(cached.data), type: "jpg" };

  const raw = await loadRaw(url, prisma);
  if (!raw) return null;
  const thumb = await makeThumb(raw);
  if (!thumb) return null;

  await prisma.imageThumb
    .upsert({ where: { key: url }, create: { key: url, data: Uint8Array.from(thumb) }, update: {} })
    .catch(() => {});
  return { bytes: thumb, type: "jpg" };
}
