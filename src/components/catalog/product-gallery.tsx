"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

/** Detail-page gallery for products with more than one photo: a large active
 *  image plus a row of selectable thumbnails. */
export function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  const src = images[Math.min(active, images.length - 1)];

  return (
    <div>
      <div className="relative aspect-square w-full overflow-hidden rounded-card border border-olive-100 bg-white">
        <Image
          src={src}
          alt={alt}
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-contain p-4"
        />
      </div>
      <div className="mt-3 flex gap-2">
        {images.map((img, i) => (
          <button
            key={img + i}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`View photo ${i + 1}`}
            aria-current={i === active}
            className={cn(
              "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-white transition-colors",
              i === active ? "border-olive-500 ring-2 ring-olive-200" : "border-olive-100 hover:border-olive-300",
            )}
          >
            <Image src={img} alt="" fill sizes="64px" className="object-contain p-1" />
          </button>
        ))}
      </div>
    </div>
  );
}
