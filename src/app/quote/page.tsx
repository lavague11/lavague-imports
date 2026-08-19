import type { Metadata } from "next";

import { QuoteView } from "@/components/cart/quote-view";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Request a quote",
  description:
    "Send your product list to La Vague Imports and we'll reply with pricing, freight, and lead time — usually within one business day.",
};

export default function QuotePage() {
  return (
    <Container className="py-12 lg:py-16">
      <header className="max-w-2xl">
        <p className="eyebrow">Quote list</p>
        <h1 className="mt-3 text-4xl text-olive-900 sm:text-5xl">
          Request a quote
        </h1>
        <p className="mt-4 leading-relaxed text-olive-700">
          We price by the order rather than at the till — case quantities,
          freight, and trade terms all move the number. Send your list and
          we&apos;ll come back with a firm quote.
        </p>
      </header>

      <div className="mt-12">
        <QuoteView />
      </div>
    </Container>
  );
}
