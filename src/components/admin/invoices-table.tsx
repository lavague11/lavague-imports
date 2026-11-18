"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDownUp, Download, Search, Trash2, Archive, ArchiveRestore } from "lucide-react";

export interface InvoiceRow {
  id: string;
  number: string;
  customer: string;
  customerId: string;
  issueISO: string;
  issueLabel: string;
  dueLabel: string;
  totalCents: number;
  paidCents: number;
  dispKey: string;
  dispLabel: string;
  dispBadge: string;
  archived: boolean;
}

const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TABS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "open", label: "Open" },
  { key: "overdue", label: "Overdue" },
  { key: "partial", label: "Partial" },
  { key: "paid", label: "Paid" },
  { key: "archived", label: "Archived" },
];

const SORTS = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "amount-high", label: "Amount: high → low" },
  { key: "amount-low", label: "Amount: low → high" },
];

export function InvoicesTable({ rows }: { rows: InvoiceRow[] }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [sort, setSort] = useState("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter((r) => (tab === "archived" ? r.archived : !r.archived));
    if (tab !== "all" && tab !== "archived") out = out.filter((r) => r.dispKey === tab);
    if (needle) out = out.filter((r) => `${r.number} ${r.customer}`.toLowerCase().includes(needle));
    out = [...out].sort((a, b) => {
      if (sort === "oldest") return a.issueISO.localeCompare(b.issueISO);
      if (sort === "amount-high") return b.totalCents - a.totalCents;
      if (sort === "amount-low") return a.totalCents - b.totalCents;
      return b.issueISO.localeCompare(a.issueISO); // newest
    });
    return out;
  }, [rows, q, tab, sort]);

  const suggestions = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return rows.filter((r) => `${r.number} ${r.customer}`.toLowerCase().includes(needle)).slice(0, 8);
  }, [rows, q]);

  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach((r) => next.delete(r.id));
      else filtered.forEach((r) => next.add(r.id));
      return next;
    });
  };
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedIds = [...selected];

  const exportCsv = () => {
    const header = ["Invoice", "Customer", "Issue date", "Due date", "Total", "Paid", "Balance", "Status"];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [header.map(esc).join(",")];
    for (const r of filtered) {
      lines.push(
        [
          r.number,
          r.customer,
          r.issueLabel,
          r.dueLabel,
          (r.totalCents / 100).toFixed(2),
          (r.paidCents / 100).toFixed(2),
          ((r.totalCents - r.paidCents) / 100).toFixed(2),
          r.dispLabel,
        ].map((v) => esc(String(v))).join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Toolbar: search (left) + sort + export (right) */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-olive-400" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => { blurTimer.current = setTimeout(() => setFocused(false), 150); }}
            placeholder="Search number or customer…"
            className="h-10 w-full rounded-lg border border-olive-200 pl-9 pr-3 text-sm focus:border-olive-500 focus:outline-none"
          />
          {focused && suggestions.length > 0 ? (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-olive-100 bg-white shadow-lg">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <a
                    href={`/admin/invoices/${s.id}`}
                    onMouseDown={(e) => e.preventDefault()}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-olive-50"
                  >
                    <span><span className="font-medium text-olive-900">{s.number}</span> <span className="text-olive-500">· {s.customer}</span></span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.dispBadge}`}>{s.dispLabel}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <ArrowDownUp className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-olive-400" aria-hidden="true" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="h-10 rounded-lg border border-olive-200 bg-white pl-8 pr-3 text-sm focus:border-olive-500 focus:outline-none"
            >
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <button type="button" onClick={exportCsv} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-olive-200 px-3 text-sm font-medium text-olive-700 hover:bg-olive-50">
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full border px-2.5 py-1 text-xs ${tab === t.key ? "border-olive-900 bg-olive-900 text-white" : "border-olive-200 text-olive-700 hover:bg-olive-50"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selectedIds.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-olive-200 bg-olive-50/60 px-3 py-2 text-sm">
          <span className="font-medium text-olive-800">{selectedIds.length} selected</span>
          <div className="ml-auto flex gap-2">
            <form method="post" action="/admin/invoices/bulk">
              {selectedIds.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
              <input type="hidden" name="action" value={tab === "archived" ? "unarchive" : "archive"} />
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-olive-200 bg-white px-3 py-1.5 text-xs font-medium text-olive-700 hover:bg-olive-50">
                {tab === "archived" ? <><ArchiveRestore className="h-3.5 w-3.5" /> Unarchive</> : <><Archive className="h-3.5 w-3.5" /> Archive</>}
              </button>
            </form>
            <form method="post" action="/admin/invoices/bulk" onSubmit={(e) => { if (!window.confirm(`Permanently delete ${selectedIds.length} invoice(s)? This can't be undone.`)) e.preventDefault(); }}>
              {selectedIds.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
              <input type="hidden" name="action" value="delete" />
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-olive-200 bg-white p-10 text-center text-olive-500">
          {rows.length === 0 ? "No invoices yet." : "No invoices match."}
        </div>
      ) : (
        <>
        {/* Mobile: invoice cards (no sideways scroll) */}
        <div className="mt-4 divide-y divide-olive-50 overflow-hidden rounded-xl border border-olive-100 bg-white lg:hidden">
          {filtered.map((r) => {
            const balance = r.totalCents - r.paidCents;
            const overdue = r.dispKey === "overdue";
            return (
              <div key={r.id} className={`flex items-center gap-3 p-3 ${overdue ? "bg-red-50/40" : ""} ${selected.has(r.id) ? "bg-olive-50/60" : ""}`}>
                <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.number}`} className="h-5 w-5 shrink-0 accent-olive-800" />
                <a href={`/admin/invoices/${r.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-olive-900">{r.number}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${r.dispBadge}`}>{r.dispLabel}</span>
                  </div>
                  <p className="truncate text-sm text-olive-600">{r.customer}</p>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-xs">
                    <span className="text-olive-500">{r.issueLabel}</span>
                    <span className="text-olive-700">{money(r.totalCents)}{balance > 0 ? <span className="text-olive-900"> · bal {money(balance)}</span> : ""}</span>
                  </div>
                </a>
              </div>
            );
          })}
        </div>

        {/* Desktop: table */}
        <div className="mt-4 hidden overflow-x-auto rounded-xl border border-olive-100 bg-white lg:block">
          <table className="w-full text-sm">
            <thead className="border-b border-olive-100 bg-olive-50/60 text-left text-olive-600">
              <tr>
                <th className="w-10 p-3"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all" className="h-4 w-4 accent-olive-800" /></th>
                <th className="p-3">Invoice</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Date</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-right">Balance</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const balance = r.totalCents - r.paidCents;
                const overdue = r.dispKey === "overdue";
                return (
                  <tr key={r.id} className={`border-b border-olive-50 last:border-0 hover:bg-olive-50/40 ${selected.has(r.id) ? "bg-olive-50/60" : ""} ${overdue ? "bg-red-50/40" : ""}`}>
                    <td className="p-3"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.number}`} className="h-4 w-4 accent-olive-800" /></td>
                    <td className="p-3 font-medium"><a href={`/admin/invoices/${r.id}`} className="text-olive-900 hover:underline">{r.number}</a></td>
                    <td className="p-3"><a href={`/admin/customers/${r.customerId}`} className="text-olive-700 hover:underline">{r.customer}</a></td>
                    <td className="p-3 whitespace-nowrap text-olive-600">{r.issueLabel}</td>
                    <td className="p-3 text-right text-olive-800">{money(r.totalCents)}</td>
                    <td className={`p-3 text-right ${balance > 0 ? "font-medium text-olive-900" : "text-olive-400"}`}>{balance > 0 ? money(balance) : "—"}</td>
                    <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.dispBadge}`}>{r.dispLabel}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
