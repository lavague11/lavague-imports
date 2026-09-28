import Link from "next/link";

/** Placeholder for admin sections that are part of the wholesale system now
 *  being built (the data model has shipped; screens follow). */
export function ComingSoon({
  title,
  blurb,
  bullets,
}: {
  title: string;
  blurb: string;
  bullets?: string[];
}) {
  return (
    <div>
      <h1 className="font-display text-2xl text-olive-900">{title}</h1>
      <div className="mt-6 max-w-2xl rounded-xl border border-olive-100 bg-white p-6">
        <span className="inline-flex items-center rounded-full bg-olive-100 px-2.5 py-1 text-xs font-medium text-olive-700">
          In progress
        </span>
        <p className="mt-3 text-sm leading-relaxed text-olive-700">{blurb}</p>
        {bullets?.length ? (
          <ul className="mt-4 space-y-1.5 text-sm text-olive-600">
            {bullets.map((b) => (
              <li key={b} className="flex gap-2">
                <span className="text-olive-400">·</span>
                {b}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-5 text-xs text-olive-500">
          The canonical data model (accounts, quotes, orders, invoices, payments, deliveries) is
          in place. These screens are built on top of it phase by phase.
        </p>
        <Link
          href="/admin"
          className="mt-4 inline-block text-sm font-medium text-olive-700 underline underline-offset-4 hover:text-olive-900"
        >
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}
