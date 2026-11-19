"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronDown, ChevronLeft } from "lucide-react";

const RANGES = [
  { k: "today", l: "Today" },
  { k: "7d", l: "7 days" },
  { k: "30d", l: "30 days" },
  { k: "month", l: "This month" },
  { k: "year", l: "This year" },
  { k: "custom", l: "Custom range" },
];

const fmt = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

/** Dashboard date-range picker (DASHBOARD §1b) — a single button that opens a
 *  menu. Picking "Custom range" steps through a start date then an end date in
 *  the same popover, so the page never reflows while choosing. Drives the money
 *  cards and range-based sections via ?range= (+ ?from/?to for custom). */
export function DateRangePicker({ current, from, to }: { current: string; from?: string; to?: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "custom">("menu");
  const [customStep, setCustomStep] = useState<"start" | "end">("start");
  const [start, setStart] = useState(from ?? "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);

  const go = (params: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    router.push(`/admin?${p.toString()}`);
  };

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // When a fresh custom step appears, focus the input and pop its calendar.
  useEffect(() => {
    if (!open || mode !== "custom") return;
    const el = customStep === "start" ? startRef.current : endRef.current;
    if (!el) return;
    el.focus();
    // showPicker isn't in every browser; guard it.
    try {
      (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      /* ignore */
    }
  }, [open, mode, customStep]);

  const openMenu = () => {
    setMode("menu");
    setCustomStep("start");
    setStart(from ?? "");
    setOpen((o) => !o);
  };

  const pickPreset = (k: string) => {
    if (k === "custom") {
      setMode("custom");
      setCustomStep("start");
      return;
    }
    setOpen(false);
    go({ range: k, from: null, to: null });
  };

  const label =
    current === "custom"
      ? from && to
        ? `${fmt(from)} – ${fmt(to)}`
        : from
          ? `From ${fmt(from)}`
          : "Custom range"
      : (RANGES.find((r) => r.k === current)?.l ?? "This month");

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={openMenu}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg border border-olive-200 bg-white px-3 py-1.5 text-sm font-medium text-olive-800 hover:bg-olive-50"
      >
        <CalendarDays className="h-4 w-4 text-olive-500" />
        <span>{label}</span>
        <ChevronDown className="h-4 w-4 text-olive-400" />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-60 overflow-hidden rounded-xl border border-olive-100 bg-white p-1.5 shadow-lg">
          {mode === "menu" ? (
            RANGES.map((r) => (
              <button
                key={r.k}
                type="button"
                onClick={() => pickPreset(r.k)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                  current === r.k ? "bg-olive-900 text-white" : "text-olive-700 hover:bg-olive-50"
                }`}
              >
                {r.l}
                {r.k === "custom" ? <ChevronDown className="h-4 w-4 -rotate-90 opacity-60" /> : null}
              </button>
            ))
          ) : (
            <div className="p-1">
              <button
                type="button"
                onClick={() => setMode("menu")}
                className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-olive-500 hover:text-olive-800"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </button>

              <p className="mb-1 text-xs font-medium text-olive-600">
                {customStep === "start" ? "Pick a start date" : "Pick an end date"}
              </p>

              {customStep === "start" ? (
                <input
                  ref={startRef}
                  type="date"
                  defaultValue={from}
                  max={to || undefined}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    setStart(v);
                    setCustomStep("end");
                  }}
                  className="h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none"
                />
              ) : (
                <>
                  <p className="mb-2 text-xs text-olive-400">Start: {fmt(start)}</p>
                  <input
                    ref={endRef}
                    type="date"
                    defaultValue={to}
                    min={start || undefined}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      setOpen(false);
                      go({ range: "custom", from: start, to: v });
                    }}
                    className="h-10 w-full rounded-lg border border-olive-200 px-3 text-sm focus:border-olive-500 focus:outline-none"
                  />
                </>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
