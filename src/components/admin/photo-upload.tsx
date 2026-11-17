"use client";

import { useRef, useState } from "react";
import { Camera, Upload, X } from "lucide-react";

import { PHOTO_KINDS, photoKindLabel } from "@/lib/invoice-photo-constants";

/**
 * Upload or take a photo, tag what it is (Delivery / Payment method / Other +
 * free text), and submit. Multipart POST to the invoice's photo route.
 * `accept="image/*"` with no `capture` lets phones offer both the camera and
 * the photo library; desktop gets a file picker.
 */
export function PhotoUpload({ action }: { action: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [kind, setKind] = useState<string>("DELIVERY");

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFileName(f.name || "photo");
      setPreview(URL.createObjectURL(f));
    } else {
      setFileName("");
      setPreview(null);
    }
  };
  const reset = () => {
    setFileName("");
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <form method="post" action={action} encType="multipart/form-data" className="rounded-xl border border-dashed border-olive-200 bg-white p-4">
      <input ref={inputRef} type="file" name="photo" accept="image/*" onChange={onPick} className="hidden" />

      {!fileName ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-olive-200 bg-olive-50/50 px-4 py-6 text-sm font-medium text-olive-700 hover:bg-olive-50"
        >
          <Camera className="h-5 w-5" /> Add or take a photo
        </button>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {preview ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={preview} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-olive-100 object-cover" />
            ) : null}
            <span className="min-w-0 flex-1 truncate text-sm text-olive-700">{fileName}</span>
            <button type="button" onClick={reset} aria-label="Remove" className="text-olive-400 hover:text-red-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-olive-800">What is this?</p>
            <input type="hidden" name="kind" value={kind} />
            <div className="inline-flex flex-wrap gap-1.5">
              {PHOTO_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    kind === k ? "border-olive-900 bg-olive-900 text-white" : "border-olive-200 text-olive-700 hover:bg-olive-50"
                  }`}
                >
                  {photoKindLabel(k)}
                </button>
              ))}
            </div>
            {kind === "OTHER" ? (
              <input
                name="label"
                placeholder="Describe it (e.g. damaged carton, signed slip…)"
                className="mt-2 h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none"
              />
            ) : null}
          </div>

          <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-olive-900 px-4 py-2 text-sm font-medium text-white hover:bg-olive-800">
            <Upload className="h-4 w-4" /> Upload photo
          </button>
        </div>
      )}
    </form>
  );
}
