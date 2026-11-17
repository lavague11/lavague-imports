"use client";

import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";

/** Optional "attach a photo of the check/receipt" field for the record-payment
 *  form. `accept="image/*"` with no capture → phones offer camera or library. */
export function PaymentPhotoField() {
  const ref = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setName(f.name || "photo");
      setPreview(URL.createObjectURL(f));
    } else {
      setName("");
      setPreview(null);
    }
  };
  const reset = () => {
    setName("");
    setPreview(null);
    if (ref.current) ref.current.value = "";
  };

  return (
    <div>
      <input ref={ref} type="file" name="photo" accept="image/*" onChange={onPick} className="hidden" />
      {!name ? (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-olive-200 px-3 py-2 text-sm text-olive-700 hover:bg-olive-50"
        >
          <Camera className="h-4 w-4" /> Attach a photo of the check/receipt
        </button>
      ) : (
        <div className="inline-flex items-center gap-2 rounded-lg border border-olive-200 px-2 py-1.5">
          {preview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={preview} alt="" className="h-8 w-8 rounded object-cover" />
          ) : null}
          <span className="max-w-[12rem] truncate text-sm text-olive-700">{name}</span>
          <button type="button" onClick={reset} aria-label="Remove photo" className="text-olive-400 hover:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
