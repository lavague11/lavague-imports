// Shared Google Places Autocomplete helper. Attaches to any input element.
// If NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set, the input gets live US suggestions
// ("address" for a street box, "establishment" for a business box) and selecting
// one calls onPlace with the parsed address. With NO key it's a no-op — the input
// stays an ordinary manual-entry field, no errors, no broken UI.

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export const hasPlacesKey = Boolean(KEY);

interface AddrComponent { long_name: string; short_name: string; types: string[] }
interface MapsPlace {
  name?: string;
  address_components?: AddrComponent[];
  geometry?: { location?: { lat: () => number; lng: () => number } };
  place_id?: string;
}

export interface PlaceResult {
  name: string;
  street: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  lat: string;
  lng: string;
  placeId: string;
}

function loadMapsApi(): Promise<void> {
  if (typeof window === "undefined" || !KEY) return Promise.reject(new Error("no key"));
  const w = window as unknown as { google?: { maps?: { places?: unknown } } };
  if (w.google?.maps?.places) return Promise.resolve();
  const existing = document.getElementById("gmaps-js") as HTMLScriptElement | null;
  if (existing) {
    return new Promise((res) => existing.addEventListener("load", () => res(), { once: true }));
  }
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.id = "gmaps-js";
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&libraries=places&loading=async`;
    s.async = true;
    s.onload = () => res();
    s.onerror = () => rej(new Error("maps load failed"));
    document.head.appendChild(s);
  });
}

// Wire autocomplete onto `el`. Returns a cleanup function. No-op without a key.
export function attachAutocomplete(
  el: HTMLInputElement,
  mode: "address" | "establishment",
  onPlace: (p: PlaceResult) => void,
): () => void {
  if (!KEY) return () => {};
  let cancelled = false;
  loadMapsApi()
    .then(() => {
      if (cancelled) return;
      const g = (window as unknown as {
        google: { maps: { places: { Autocomplete: new (el: HTMLInputElement, opts: object) => { addListener: (e: string, cb: () => void) => void; getPlace: () => MapsPlace } } } };
      }).google;
      const ac = new g.maps.places.Autocomplete(el, {
        componentRestrictions: { country: "us" },
        fields: ["address_components", "geometry", "place_id", "name"],
        types: [mode],
      });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        const comps = place.address_components ?? [];
        const get = (type: string, short = false) => {
          const c = comps.find((x) => x.types.includes(type));
          return c ? (short ? c.short_name : c.long_name) : "";
        };
        onPlace({
          name: place.name ?? "",
          street: [get("street_number"), get("route")].filter(Boolean).join(" "),
          unit: get("subpremise"),
          city: get("locality") || get("sublocality") || get("postal_town"),
          state: get("administrative_area_level_1", true),
          zip: get("postal_code"),
          lat: place.geometry?.location ? String(place.geometry.location.lat()) : "",
          lng: place.geometry?.location ? String(place.geometry.location.lng()) : "",
          placeId: place.place_id ?? "",
        });
      });
    })
    .catch(() => { /* no key / load failure → manual entry */ });
  return () => { cancelled = true; };
}
