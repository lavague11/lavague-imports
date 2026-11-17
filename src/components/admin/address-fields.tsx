"use client";

import { useEffect, useRef, useState } from "react";

// Google Places Autocomplete-ready address group. If
// NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set, typing in Street shows US suggestions
// and selecting one fills every field + lat/lng/place_id. With NO key, these are
// ordinary manual-entry inputs — no errors, no broken UI.

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

interface AddrComponent {
  long_name: string;
  short_name: string;
  types: string[];
}
interface MapsPlace {
  address_components?: AddrComponent[];
  geometry?: { location?: { lat: () => number; lng: () => number } };
  place_id?: string;
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

export interface AddressValue {
  street: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  lat: string;
  lng: string;
  placeId: string;
}

const fieldClass =
  "h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none";
const labelClass = "mb-1 block text-sm font-medium text-olive-800";

export function AddressFields({ initial }: { initial: Partial<AddressValue> }) {
  const [addr, setAddr] = useState<AddressValue>({
    street: initial.street ?? "",
    unit: initial.unit ?? "",
    city: initial.city ?? "",
    state: initial.state ?? "",
    zip: initial.zip ?? "",
    lat: initial.lat ?? "",
    lng: initial.lng ?? "",
    placeId: initial.placeId ?? "",
  });
  const streetRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<AddressValue>) => setAddr((a) => ({ ...a, ...patch }));

  useEffect(() => {
    if (!KEY || !streetRef.current) return;
    let cancelled = false;
    loadMapsApi()
      .then(() => {
        if (cancelled || !streetRef.current) return;
        const g = (window as unknown as { google: { maps: { places: { Autocomplete: new (el: HTMLInputElement, opts: object) => { addListener: (e: string, cb: () => void) => void; getPlace: () => MapsPlace } } } } }).google;
        const ac = new g.maps.places.Autocomplete(streetRef.current, {
          componentRestrictions: { country: "us" },
          fields: ["address_components", "geometry", "place_id"],
          types: ["address"],
        });
        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          const comps = place.address_components ?? [];
          const get = (type: string, short = false) => {
            const c = comps.find((x) => x.types.includes(type));
            return c ? (short ? c.short_name : c.long_name) : "";
          };
          const streetNo = get("street_number");
          const route = get("route");
          set({
            street: [streetNo, route].filter(Boolean).join(" ") || streetRef.current!.value,
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
      .catch(() => {
        /* no key or load failure → manual entry, no error shown */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="street" className={labelClass}>Street address</label>
        <input
          ref={streetRef}
          id="street"
          name="street"
          value={addr.street}
          onChange={(e) => set({ street: e.target.value })}
          autoComplete="off"
          placeholder={KEY ? "Start typing an address…" : "123 Main St"}
          className={fieldClass}
        />
      </div>
      <div>
        <label htmlFor="unit" className={labelClass}>Unit / suite</label>
        <input id="unit" name="unit" value={addr.unit} onChange={(e) => set({ unit: e.target.value })} className={fieldClass} />
      </div>
      <div>
        <label htmlFor="city" className={labelClass}>City</label>
        <input id="city" name="city" value={addr.city} onChange={(e) => set({ city: e.target.value })} className={fieldClass} />
      </div>
      <div>
        <label htmlFor="state" className={labelClass}>State</label>
        <input id="state" name="state" value={addr.state} onChange={(e) => set({ state: e.target.value })} className={fieldClass} />
      </div>
      <div>
        <label htmlFor="zip" className={labelClass}>ZIP</label>
        <input id="zip" name="zip" value={addr.zip} onChange={(e) => set({ zip: e.target.value })} className={fieldClass} />
      </div>
      <input type="hidden" name="lat" value={addr.lat} />
      <input type="hidden" name="lng" value={addr.lng} />
      <input type="hidden" name="placeId" value={addr.placeId} />
    </div>
  );
}
