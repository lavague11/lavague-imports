"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Share2, X } from "lucide-react";

import { Flag } from "@/components/ui/flag";

interface Country {
  slug: string;
  name: string;
  count: number;
}

const boxLabel =
  "flex cursor-pointer items-center gap-2 rounded-lg border border-olive-200 px-3 py-2 text-sm text-olive-800 transition-colors hover:border-olive-400 has-[:checked]:border-olive-700 has-[:checked]:bg-olive-50";

/** Pull the filename out of a Content-Disposition header, with a fallback. */
function filenameFrom(disposition: string | null, fallback: string) {
  const m = disposition?.match(/filename="?([^"]+)"?/i);
  return m?.[1] ?? fallback;
}

export function CatalogDownload({ countries }: { countries: Country[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<null | "download" | "share">(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
    setNote(null);
    setBusy(null);
  }, []);

  // Close on Escape while the modal is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const allOn = selected.size === countries.length && countries.length > 0;

  const toggle = (slug: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  const buildUrl = () => {
    const params = new URLSearchParams();
    for (const slug of selected) params.append("countries", slug);
    const qs = params.toString();
    return `/admin/catalog/generate${qs ? `?${qs}` : ""}`;
  };

  const niceName = () => {
    if (selected.size === 0) return "la-vague-catalog.pdf";
    if (selected.size === 1) return `la-vague-catalog-${[...selected][0]}.pdf`;
    return `la-vague-catalog-${selected.size}-countries.pdf`;
  };

  async function fetchPdf(): Promise<{ blob: Blob; filename: string } | null> {
    const res = await fetch(buildUrl());
    if (!res.ok) {
      setError(
        res.status === 404
          ? "Nothing matched that selection. Try fewer countries, or download the whole range."
          : "Couldn't build the catalog. Please try again.",
      );
      return null;
    }
    const blob = await res.blob();
    return { blob, filename: filenameFrom(res.headers.get("Content-Disposition"), niceName()) };
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function onDownload() {
    setError(null);
    setNote(null);
    setBusy("download");
    try {
      const got = await fetchPdf();
      if (got) triggerDownload(got.blob, got.filename);
    } catch {
      setError("Couldn't build the catalog. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function onShare() {
    setError(null);
    setNote(null);
    setBusy("share");
    try {
      const got = await fetchPdf();
      if (!got) return;
      const file = new File([got.blob], got.filename, { type: "application/pdf" });
      const nav = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
      };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await nav.share({
            files: [file],
            title: "La Vague Imports catalog",
            text: "Our latest catalog.",
          });
        } catch (err) {
          // User dismissing the share sheet throws AbortError — not an error.
          if ((err as Error)?.name !== "AbortError") {
            setError("Couldn't open the share menu. The catalog was downloaded instead.");
            triggerDownload(got.blob, got.filename);
          }
        }
      } else {
        // No file sharing on this browser (most desktops) — download instead.
        triggerDownload(got.blob, got.filename);
        setNote("Sharing isn't supported on this browser, so the catalog was downloaded — attach it to an email or message.");
      }
    } catch {
      setError("Couldn't build the catalog. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-olive-200 bg-white px-3 py-1.5 font-medium text-olive-700 hover:bg-olive-50"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Download catalog
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Download catalog"
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="absolute inset-0 cursor-default bg-olive-950/40"
          />

          {/* Panel */}
          <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-olive-100 px-6 py-4">
              <div>
                <h2 className="font-display text-lg text-olive-900">Download catalog</h2>
                <p className="mt-0.5 text-sm text-olive-500">
                  Pick the countries you want, or download the whole range.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="-mr-2 -mt-1 rounded-full p-1.5 text-olive-500 hover:bg-olive-50 hover:text-olive-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-olive-800">Countries</span>
                <button
                  type="button"
                  onClick={() => setSelected(allOn ? new Set() : new Set(countries.map((c) => c.slug)))}
                  className="rounded-full border border-olive-300 px-3 py-1 text-xs font-medium text-olive-700 hover:border-olive-500 hover:bg-olive-50"
                >
                  {allOn ? "Clear all" : "Select all"}
                </button>
              </div>

              {countries.length === 0 ? (
                <p className="text-sm text-olive-400">No countries available yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {countries.map((c) => (
                    <label key={c.slug} className={boxLabel}>
                      <input
                        type="checkbox"
                        checked={selected.has(c.slug)}
                        onChange={() => toggle(c.slug)}
                        className="h-4 w-4 accent-olive-800"
                      />
                      <Flag country={c.name} className="w-5" />
                      <span className="truncate">{c.name}</span>
                      <span className="ml-auto text-xs text-olive-400">{c.count}</span>
                    </label>
                  ))}
                </div>
              )}

              <p className="mt-4 text-xs text-olive-500">
                {selected.size === 0
                  ? "Nothing selected downloads the full catalog."
                  : `${selected.size} ${selected.size === 1 ? "country" : "countries"} selected.`}
              </p>

              {error ? (
                <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              ) : null}
              {note ? (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{note}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 border-t border-olive-100 px-6 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onShare}
                disabled={busy !== null}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-olive-300 bg-white px-6 text-sm font-medium text-olive-900 hover:border-olive-500 hover:bg-olive-50 disabled:opacity-60"
              >
                <Share2 className="h-4 w-4" aria-hidden="true" />
                {busy === "share" ? "Preparing…" : "Share"}
              </button>
              <button
                type="button"
                onClick={onDownload}
                disabled={busy !== null}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-olive-900 px-6 text-sm font-medium text-white hover:bg-olive-800 disabled:opacity-60"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                {busy === "download" ? "Preparing…" : "Download"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
