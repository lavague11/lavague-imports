"use client";

import { useState } from "react";

const inputClass =
  "h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:ring-2 focus:ring-olive-200 focus:outline-none";

interface SlotProps {
  index: number;
  initialUrl: string;
  searchName?: string;
}

function Slot({ index, initialUrl, searchName }: SlotProps) {
  const [url, setUrl] = useState(initialUrl);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const preview = filePreview ?? url;
  const searchHref =
    index === 0 && searchName
      ? `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchName)}`
      : null;

  return (
    <div className="flex gap-3">
      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-olive-100 bg-olive-50">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="text-[10px] text-olive-400">
            {index === 0 ? "main" : `photo ${index + 1}`}
          </span>
        )}
      </div>
      <div className="flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <input
            name={`imageUrl${index}`}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={index === 0 ? "Main image URL…" : `Photo ${index + 1} URL (optional)…`}
            className={inputClass}
          />
          {searchHref ? (
            <a
              href={searchHref}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-xs font-medium text-olive-700 hover:underline"
            >
              Search ↗
            </a>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="file"
            name={`imageFile${index}`}
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setFilePreview(f ? URL.createObjectURL(f) : null);
            }}
            className="text-xs text-olive-600 file:mr-2 file:rounded-md file:border file:border-olive-200 file:bg-olive-50 file:px-2 file:py-1 file:text-olive-700"
          />
          {url ? (
            <button
              type="button"
              onClick={() => setUrl("")}
              className="text-xs text-olive-500 hover:text-red-700"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Up to three product-photo slots. Each posts imageUrl<i> (a pasted/kept URL)
 * and imageFile<i> (an optional upload, which wins on the server). The first
 * slot is the main/card image.
 */
export function ImageSlots({
  initial = [],
  count = 3,
  searchName,
}: {
  initial?: string[];
  count?: number;
  searchName?: string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-olive-800">Photos (up to {count})</p>
      <p className="-mt-1 text-xs text-olive-500">
        Paste an image link or upload a file for each slot. The first is the main photo.
      </p>
      {Array.from({ length: count }, (_, i) => (
        <Slot key={i} index={i} initialUrl={initial[i] ?? ""} searchName={searchName} />
      ))}
    </div>
  );
}
