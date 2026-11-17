import "server-only";

import { Jimp } from "jimp";

import { requirePrisma } from "@/lib/db";

export { PHOTO_KINDS, photoKindLabel, PHOTO_KIND_BADGE, type PhotoKind } from "@/lib/invoice-photo-constants";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB guard on the original upload.
const MAX_WIDTH = 1600;

/**
 * Downscale a large photo to a web-friendly JPEG so phone uploads don't bloat
 * the database. Best-effort: formats Jimp can't read (e.g. HEIC) fall through to
 * the original bytes so the upload still succeeds.
 */
async function normalize(bytes: Uint8Array, type: string): Promise<{ data: Uint8Array; contentType: string }> {
  try {
    const img = await Jimp.read(Buffer.from(bytes));
    if (img.width > MAX_WIDTH) img.resize({ w: MAX_WIDTH });
    const out = await img.getBuffer("image/jpeg", { quality: 82 });
    return { data: new Uint8Array(out), contentType: "image/jpeg" };
  } catch {
    return { data: bytes, contentType: type || "image/jpeg" };
  }
}

/** Store an uploaded invoice photo in MediaAsset; returns its /media/<id> url. */
export async function storeInvoicePhoto(file: File): Promise<string | null> {
  if (!file || typeof file.arrayBuffer !== "function" || file.size === 0) return null;
  if (file.size > MAX_BYTES) return null;
  const raw = new Uint8Array(await file.arrayBuffer());
  if (raw.length === 0) return null;

  const { data, contentType } = await normalize(raw, file.type);
  const prisma = requirePrisma();
  const asset = await prisma.mediaAsset.create({
    data: { contentType, data: Uint8Array.from(data) },
    select: { id: true },
  });
  return `/media/${asset.id}`;
}
