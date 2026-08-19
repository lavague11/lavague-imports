import Link from "next/link";

import { OliveMark } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export default function NotFound() {
  return (
    <Container className="py-28 text-center">
      <OliveMark className="mx-auto h-10 w-auto text-olive-300" />
      <h1 className="mt-8 text-4xl text-olive-900">We couldn&apos;t find that</h1>
      <p className="mx-auto mt-4 max-w-md leading-relaxed text-olive-600">
        The page may have moved, or the product might be out of season. Try the
        shop — everything we currently carry is listed there.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/shop" className={buttonClasses()}>
          Browse the shop
        </Link>
        <Link href="/" className={buttonClasses({ variant: "secondary" })}>
          Back home
        </Link>
      </div>
    </Container>
  );
}
