"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

const STORAGE_KEY = "lvq-cart-v1";

export interface CartLine {
  variantId: string;
  sku: string;
  productSlug: string;
  productName: string;
  variantName: string;
  /** Null for quote-only lines that have no listed price. */
  unitPriceCents: number | null;
  quantity: number;
}

/* -------------------------------------------------------------------------
 * localStorage-backed store
 *
 * The quote list lives in localStorage, which makes it an external store
 * rather than React state. Reading it through useSyncExternalStore keeps the
 * server render (always empty) and the hydrated client render consistent,
 * and gives cross-tab syncing for free.
 * ---------------------------------------------------------------------- */

const EMPTY: CartLine[] = [];

let snapshot: CartLine[] = EMPTY;
let hasLoaded = false;
const listeners = new Set<() => void>();

function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Partial<CartLine>;
  return (
    typeof line.variantId === "string" &&
    (typeof line.unitPriceCents === "number" || line.unitPriceCents === null) &&
    typeof line.quantity === "number" &&
    typeof line.productSlug === "string"
  );
}

function readStorage(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    // Drop anything malformed so an old or corrupted payload can't break the
    // storefront for a returning visitor.
    return Array.isArray(parsed) ? parsed.filter(isCartLine) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function getSnapshot(): CartLine[] {
  if (!hasLoaded && typeof window !== "undefined") {
    hasLoaded = true;
    snapshot = readStorage();
  }
  return snapshot;
}

function getServerSnapshot(): CartLine[] {
  return EMPTY;
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    snapshot = readStorage();
    emit();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function write(next: CartLine[]) {
  snapshot = next;
  hasLoaded = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing or a full quota — keep the in-memory list working.
  }
  emit();
}

/* ------------------------------------------------------------------------ */

interface CartContextValue {
  lines: CartLine[];
  /** False until hydration completes, while the list still reads as empty. */
  isReady: boolean;
  itemCount: number;
  subtotalCents: number;
  addLine: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  removeLine: (variantId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const lines = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isReady = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const addLine = useCallback(
    (line: Omit<CartLine, "quantity">, quantity = 1) => {
      const current = getSnapshot();
      const existing = current.find((l) => l.variantId === line.variantId);
      write(
        existing
          ? current.map((l) =>
              l.variantId === line.variantId
                ? { ...l, quantity: l.quantity + quantity }
                : l,
            )
          : [...current, { ...line, quantity }],
      );
    },
    [],
  );

  const setQuantity = useCallback((variantId: string, quantity: number) => {
    const current = getSnapshot();
    write(
      quantity <= 0
        ? current.filter((l) => l.variantId !== variantId)
        : current.map((l) => (l.variantId === variantId ? { ...l, quantity } : l)),
    );
  }, []);

  const removeLine = useCallback((variantId: string) => {
    write(getSnapshot().filter((l) => l.variantId !== variantId));
  }, []);

  const clear = useCallback(() => write(EMPTY), []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      isReady,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      subtotalCents: lines.reduce(
        (sum, line) => sum + line.quantity * (line.unitPriceCents ?? 0),
        0,
      ),
      addLine,
      setQuantity,
      removeLine,
      clear,
    }),
    [lines, isReady, addLine, setQuantity, removeLine, clear],
  );

  return <CartContext value={value}>{children}</CartContext>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used inside <CartProvider>");
  }
  return context;
}
