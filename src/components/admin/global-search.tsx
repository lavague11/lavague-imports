"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

interface Results {
  customers: { id: string; label: string }[];
  invoices: { id: string; label: string; sub: string }[];
  products: { slug: string; label: string; sub: string }[];
}
const EMPTY: Results = { customers: [], invoices: [], products: [] };

/** Global ⌘K / Ctrl-K search over customers, invoices and products. Mounted in
 *  the admin layout so it's available everywhere. */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results>(EMPTY);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) { setQ(""); setRes(EMPTY); }
  }, [open]);

  const onChange = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) { setRes(EMPTY); return; }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/admin/search?q=${encodeURIComponent(v.trim())}`);
        setRes(await r.json());
      } catch {
        setRes(EMPTY);
      }
    }, 200);
  };

  const go = (href: string) => { setOpen(false); router.push(href); };
  const any = res.customers.length || res.invoices.length || res.products.length;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Search" className="inline-flex items-center gap-1.5 rounded-lg border border-olive-200 px-2.5 py-1.5 text-xs text-olive-500 hover:bg-olive-50">
        <Search className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Search</span> <kbd className="hidden rounded bg-olive-100 px-1 text-[10px] sm:inline">⌘K</kbd>
      </button>
      {open ? (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 pt-[12vh]" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-olive-100 px-4">
              <Search className="h-4 w-4 text-olive-400" />
              <input autoFocus value={q} onChange={(e) => onChange(e.target.value)} placeholder="Search customers, invoices (I# or LV#), products…" className="h-12 w-full text-sm focus:outline-none" />
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {q.trim().length >= 2 && !any ? <p className="px-2 py-3 text-sm text-olive-400">No matches.</p> : null}
              {res.invoices.length ? <Group title="Invoices" items={res.invoices.map((i) => ({ key: i.id, label: i.label, sub: i.sub, href: `/admin/invoices/${i.id}` }))} go={go} /> : null}
              {res.customers.length ? <Group title="Customers" items={res.customers.map((c) => ({ key: c.id, label: c.label, sub: "", href: `/admin/customers/${c.id}` }))} go={go} /> : null}
              {res.products.length ? <Group title="Products" items={res.products.map((p) => ({ key: p.slug, label: p.label, sub: p.sub, href: `/admin/products/${p.slug}` }))} go={go} /> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Group({ title, items, go }: { title: string; items: { key: string; label: string; sub: string; href: string }[]; go: (href: string) => void }) {
  return (
    <div className="mb-1">
      <p className="px-2 py-1 text-[10px] font-semibold tracking-wide text-olive-400 uppercase">{title}</p>
      {items.map((it) => (
        <button key={it.key} type="button" onClick={() => go(it.href)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-olive-50">
          <span className="truncate text-olive-800">{it.label}</span>
          {it.sub ? <span className="shrink-0 text-xs text-olive-400">{it.sub}</span> : null}
        </button>
      ))}
    </div>
  );
}
