"use client";

import { useEffect, useState } from "react";
import { KeyRound, Lock, Plus } from "lucide-react";

interface KeyView {
  name: string;
  label: string;
  description: string;
  kind: "secret" | "browser" | "config" | "custom";
  known: boolean;
  getUrl?: string;
  group: string;
  source: "vault" | "env" | "unset";
  masked: string | null;
  updatedAt: string | null;
}
interface VaultState {
  configured: boolean;
  unlocked: boolean;
  keys: KeyView[];
}

const KIND_BADGE: Record<KeyView["kind"], { label: string; cls: string }> = {
  browser: { label: "Browser key", cls: "bg-sky-100 text-sky-800" },
  secret: { label: "Server-side", cls: "bg-olive-100 text-olive-700" },
  config: { label: "Config", cls: "bg-olive-100 text-olive-700" },
  custom: { label: "Custom", cls: "bg-purple-100 text-purple-800" },
};
const SOURCE_BADGE: Record<KeyView["source"], { label: string; cls: string }> = {
  vault: { label: "Stored", cls: "bg-emerald-100 text-emerald-800" },
  env: { label: "From env", cls: "bg-amber-100 text-amber-800" },
  unset: { label: "Not set", cls: "bg-olive-100 text-olive-500" },
};

function fmt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `updated ${d.toLocaleString()}`;
}

export function VaultManager() {
  const [state, setState] = useState<VaultState | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ name: string; isNew: boolean } | null>(null);
  const [form, setForm] = useState({ name: "", value: "", description: "" });

  const load = async () => {
    const res = await fetch("/api/dev/vault");
    setState(await res.json());
  };
  useEffect(() => {
    // Load the vault state on mount (async — setState resolves after the fetch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const post = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/dev/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "request failed");
        return false;
      }
      if (data.keys) setState((s) => (s ? { ...s, unlocked: true, keys: data.keys } : s));
      else await load();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const submitUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await post({ action: "unlock", password })) setPassword("");
  };

  const startAdd = () => {
    setForm({ name: "", value: "", description: "" });
    setEditing({ name: "", isNew: true });
  };
  const startReplace = (k: KeyView) => {
    setForm({ name: k.name, value: "", description: k.description });
    setEditing({ name: k.name, isNew: false });
  };
  const saveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = editing?.isNew ? form.name.trim() : editing?.name;
    if (!name || !form.value) return;
    if (await post({ action: "upsert", name, value: form.value, description: form.description })) {
      setEditing(null);
      setForm({ name: "", value: "", description: "" });
    }
  };

  if (!state) return <p className="text-sm text-olive-500">Loading vault…</p>;

  if (!state.configured) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">The key vault is locked down.</p>
        <p className="mt-1">
          Set <code className="rounded bg-amber-100 px-1">DEV_PORTAL_PASSWORD</code> and{" "}
          <code className="rounded bg-amber-100 px-1">AUTH_SECRET</code> in the environment to
          enable managing keys here. They stay env-only — they protect the vault itself.
        </p>
      </div>
    );
  }

  if (!state.unlocked) {
    return (
      <form onSubmit={submitUnlock} className="flex flex-wrap items-end gap-3 rounded-xl border border-olive-100 bg-white p-4">
        <div className="flex items-center gap-2 text-olive-700">
          <Lock className="h-4 w-4" />
          <span className="text-sm font-medium">Unlock the vault to manage keys</span>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Portal passphrase"
          className="rounded-lg border border-olive-200 px-3 py-2 text-sm focus:border-olive-400 focus:outline-none"
        />
        <button
          disabled={busy}
          className="rounded-lg bg-olive-800 px-4 py-2 text-sm font-medium text-white hover:bg-olive-900 disabled:opacity-60"
        >
          {busy ? "Checking…" : "Unlock"}
        </button>
        {error ? <span className="text-sm text-red-600">{error === "wrong-password" ? "Wrong passphrase." : error}</span> : null}
      </form>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-olive-600">
          Stored on the server disk (never in git); the app reads here first, then falls back to
          environment variables.
        </p>
        <div className="flex gap-2">
          <button
            onClick={startAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-olive-800 px-3 py-2 text-sm font-medium text-white hover:bg-olive-900"
          >
            <Plus className="h-4 w-4" /> Add key
          </button>
          <button
            onClick={() => post({ action: "lock" })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-olive-200 bg-white px-3 py-2 text-sm text-olive-700 hover:bg-olive-50"
          >
            <Lock className="h-4 w-4" /> Lock
          </button>
        </div>
      </div>

      {editing?.isNew ? <KeyEditor form={form} setForm={setForm} onSave={saveKey} onCancel={() => setEditing(null)} isNew busy={busy} /> : null}

      <div className="space-y-3">
        {state.keys.map((k) => (
          <div key={k.name} className="rounded-xl border border-olive-100 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-olive-50 text-olive-600">
                    <KeyRound className="h-4 w-4" />
                  </span>
                  <h3 className="text-sm font-semibold text-olive-950">{k.label}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SOURCE_BADGE[k.source].cls}`}>
                    {SOURCE_BADGE[k.source].label}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_BADGE[k.kind].cls}`}>
                    {KIND_BADGE[k.kind].label}
                  </span>
                </div>
                <code className="mt-1.5 inline-block rounded bg-olive-50 px-1.5 py-0.5 text-xs text-olive-700">{k.name}</code>
                <p className="mt-1.5 text-sm text-olive-600">{k.description}</p>
                <p className="mt-1 font-mono text-xs text-olive-500">
                  {k.masked ? k.masked : "— not set —"}
                  {k.updatedAt ? <span className="ml-2 font-sans text-olive-400">· {fmt(k.updatedAt)}</span> : null}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1 text-xs">
                {k.getUrl ? (
                  <a href={k.getUrl} target="_blank" rel="noreferrer" className="rounded-md px-2 py-1 font-medium text-olive-700 hover:bg-olive-50">
                    Get key ↗
                  </a>
                ) : null}
                <button onClick={() => startReplace(k)} className="rounded-md px-2 py-1 font-medium text-olive-700 hover:bg-olive-50">
                  {k.source === "unset" ? "Set" : "Replace"}
                </button>
                {k.source === "vault" ? (
                  <button onClick={() => post({ action: "clear", name: k.name })} className="rounded-md px-2 py-1 font-medium text-olive-700 hover:bg-olive-50">
                    Clear
                  </button>
                ) : null}
                {!k.known ? (
                  <button onClick={() => post({ action: "delete", name: k.name })} className="rounded-md px-2 py-1 font-medium text-red-600 hover:bg-red-50">
                    Delete
                  </button>
                ) : null}
              </div>
            </div>

            {editing && !editing.isNew && editing.name === k.name ? (
              <div className="mt-3">
                <KeyEditor form={form} setForm={setForm} onSave={saveKey} onCancel={() => setEditing(null)} isNew={false} busy={busy} />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

function KeyEditor({
  form,
  setForm,
  onSave,
  onCancel,
  isNew,
  busy,
}: {
  form: { name: string; value: string; description: string };
  setForm: (f: { name: string; value: string; description: string }) => void;
  onSave: (e: React.FormEvent) => void;
  onCancel: () => void;
  isNew: boolean;
  busy: boolean;
}) {
  return (
    <form onSubmit={onSave} className="rounded-xl border border-olive-200 bg-olive-50/50 p-3">
      {isNew ? (
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="ENV_VAR_NAME"
          className="mb-2 w-full rounded-lg border border-olive-200 px-3 py-2 font-mono text-xs uppercase focus:border-olive-400 focus:outline-none"
        />
      ) : null}
      <input
        type="password"
        value={form.value}
        onChange={(e) => setForm({ ...form, value: e.target.value })}
        placeholder="Paste the new value"
        autoComplete="off"
        className="w-full rounded-lg border border-olive-200 px-3 py-2 text-sm focus:border-olive-400 focus:outline-none"
      />
      {isNew ? (
        <input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="What is this key for? (optional)"
          className="mt-2 w-full rounded-lg border border-olive-200 px-3 py-2 text-sm focus:border-olive-400 focus:outline-none"
        />
      ) : null}
      <div className="mt-2 flex gap-2">
        <button disabled={busy} className="rounded-lg bg-olive-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-olive-900 disabled:opacity-60">
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-olive-200 bg-white px-3 py-1.5 text-sm text-olive-700 hover:bg-olive-50">
          Cancel
        </button>
      </div>
    </form>
  );
}
