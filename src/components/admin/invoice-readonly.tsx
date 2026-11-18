import { formatPrice } from "@/lib/utils";

interface ROLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  isCredit: boolean;
  sku?: string | null;
}

export interface InvoiceReadOnlyProps {
  terms: string | null;
  issueLabel: string;
  dueLabel: string | null;
  salesRep: string | null;
  lines: ROLine[];
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  notes: string | null;
}

// Static, non-editable rendering of an invoice's body (used for imported history
// by default). No inputs, no Save — nothing here can mutate the record.
export function InvoiceReadOnly(p: InvoiceReadOnlyProps) {
  const creditsCents = Math.abs(p.lines.filter((l) => l.isCredit).reduce((s, l) => s + l.lineTotalCents, 0));
  const meta: [string, string][] = [
    ["Terms", p.terms || "—"],
    ["Issue date", p.issueLabel],
    ["Due date", p.dueLabel || "—"],
    ["Sales rep", p.salesRep || "—"],
  ];
  return (
    <div className="mt-4 space-y-5">
      <div className="grid grid-cols-2 gap-4 rounded-xl border border-olive-100 bg-white p-4 sm:grid-cols-4">
        {meta.map(([k, v]) => (
          <div key={k}>
            <p className="text-xs text-olive-500">{k}</p>
            <p className="text-sm font-medium text-olive-900">{v}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-olive-100 bg-white">
        <div className="grid grid-cols-[1fr_4rem_6rem_6rem] gap-2 border-b border-olive-100 bg-olive-50/60 px-4 py-2 text-xs text-olive-600">
          <span>Description</span><span className="text-right">Qty</span><span className="text-right">Unit price</span><span className="text-right">Amount</span>
        </div>
        {p.lines.map((l, i) => (
          <div key={i} className={`grid grid-cols-[1fr_4rem_6rem_6rem] gap-2 border-b border-olive-50 px-4 py-2.5 text-sm last:border-0 ${l.isCredit ? "bg-amber-50/40" : ""}`}>
            <div className="min-w-0">
              <span className="text-olive-900">{l.description}</span>
              {l.sku ? <span className="ml-1.5 text-xs text-olive-400">{l.sku}</span> : null}
              {l.isCredit ? <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">Credit</span> : null}
            </div>
            <div className="text-right text-olive-600">{l.quantity}</div>
            <div className="text-right text-olive-600">{l.isCredit ? `−${formatPrice(Math.abs(l.unitPriceCents))}` : formatPrice(l.unitPriceCents)}</div>
            <div className={`text-right ${l.isCredit ? "font-medium text-amber-700" : "text-olive-800"}`}>{l.isCredit ? `−${formatPrice(Math.abs(l.lineTotalCents))}` : formatPrice(l.lineTotalCents)}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="rounded-xl border border-olive-100 bg-white p-4">
          <p className="text-xs text-olive-500">Notes</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-olive-700">{p.notes || "—"}</p>
        </div>
        <div className="rounded-xl border border-olive-100 bg-white p-4 text-sm">
          <Row label="Subtotal" value={formatPrice(p.subtotalCents)} />
          {p.discountCents > 0 ? <Row label="Discount" value={`−${formatPrice(p.discountCents)}`} /> : null}
          {p.shippingCents > 0 ? <Row label="Delivery" value={formatPrice(p.shippingCents)} /> : null}
          {p.taxCents > 0 ? <Row label="Tax" value={formatPrice(p.taxCents)} /> : null}
          {creditsCents > 0 ? <div className="flex items-center justify-between py-1 text-amber-700"><span>Credits</span><span>−{formatPrice(creditsCents)}</span></div> : null}
          <div className="mt-2 flex items-center justify-between border-t border-olive-100 pt-2 text-base font-semibold text-olive-900">
            <span>Total</span><span>{formatPrice(p.totalCents)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-olive-600">
      <span>{label}</span><span className="text-olive-800">{value}</span>
    </div>
  );
}
