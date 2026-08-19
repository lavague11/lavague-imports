import Image from "next/image";

import { OliveMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/**
 * Renders the product photo when one exists. Until real photography is added,
 * falls back to a branded panel rather than a broken image — drop files into
 * `public/products/` and set `imageUrl` on the product to switch over.
 */
export function ProductImage({
  src,
  alt,
  className,
  priority,
}: {
  src: string | null;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  if (src) {
    return (
      <div className={cn("relative overflow-hidden bg-white", className)}>
        {/* Product shots are packshots of tall bottles/jars on varied
            backgrounds, so contain (not cover) shows the whole product without
            cropping the top or the watermark. */}
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-contain p-4"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-olive-50 via-white to-olive-100",
        className,
      )}
      role="img"
      aria-label={`${alt} — photo coming soon`}
    >
      <OliveMark className="h-12 w-auto text-olive-300" />
      <span className="absolute inset-x-0 bottom-3 text-center text-[10px] font-medium tracking-[0.2em] text-olive-400 uppercase">
        La Vague
      </span>
    </div>
  );
}
