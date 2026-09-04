"use client";

import { useState } from "react";
import { Play } from "lucide-react";

const PRESETS = [
  "/api/v1/products?limit=3",
  "/api/v1/products?category=oils-ghee&sort=price-asc&limit=5",
  "/api/v1/products?country=Morocco&limit=3",
  "/api/v1/categories",
  "/api/v1/countries",
];

/** A tiny in-portal client for the read API: pick or type a path, run it, see JSON. */
export function ApiConsole() {
  const [path, setPath] = useState(PRESETS[0]);
  const [body, setBody] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    setStatus("");
    try {
      const started = performance.now();
      const res = await fetch(path);
      const ms = Math.round(performance.now() - started);
      const json = await res.json();
      setStatus(`${res.status} ${res.statusText} · ${ms}ms`);
      setBody(JSON.stringify(json, null, 2));
    } catch (e) {
      setStatus("request failed");
      setBody(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-olive-100 bg-white p-4">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPath(p)}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              p === path
                ? "border-olive-300 bg-olive-100 text-olive-900"
                : "border-olive-100 bg-white text-olive-600 hover:bg-olive-50"
            }`}
          >
            {p.replace("/api/v1", "")}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-stretch gap-2">
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-olive-200 px-3 py-2 font-mono text-xs text-olive-900 focus:border-olive-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-olive-800 px-4 text-sm font-medium text-white hover:bg-olive-900 disabled:opacity-60"
        >
          <Play className="h-3.5 w-3.5" />
          {loading ? "Running…" : "Send"}
        </button>
      </div>

      {status ? <p className="mt-2 text-xs text-olive-600">{status}</p> : null}
      {body ? (
        <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-olive-950/95 p-3 text-xs leading-relaxed text-olive-50">
          {body}
        </pre>
      ) : null}
    </div>
  );
}
