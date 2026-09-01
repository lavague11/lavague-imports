import { fullAddress } from "@/lib/site";
import { getKey } from "@/lib/vault";

/**
 * Interactive map of the warehouse via the Google Maps Embed API. Renders only
 * when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set; otherwise returns null so callers
 * keep their existing static "Open in Maps" link as the fallback.
 */
export function WarehouseMap({ className }: { className?: string }) {
  // Read from the vault (server-rendered), so a key added in the portal works
  // without a rebuild — unlike a build-time NEXT_PUBLIC_* inlined into the client.
  const key = getKey("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
  if (!key) return null;

  const src = `https://www.google.com/maps/embed/v1/place?key=${key}&q=${encodeURIComponent(fullAddress)}&zoom=15`;

  return (
    <div className={className}>
      <iframe
        title="La Vague Imports warehouse location"
        src={src}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
        className="h-64 w-full rounded-xl border border-olive-100"
      />
    </div>
  );
}
