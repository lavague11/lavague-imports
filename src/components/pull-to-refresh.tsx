"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

// Pull-to-refresh for touch devices: swipe down while scrolled to the very top
// to reload the page. A spinner follows the pull and spins on release. Works in
// the browser and, importantly, in the iOS/Android home-screen standalone app
// where the browser's own pull-to-refresh is gone.
const THRESHOLD = 64; // px of pull needed to trigger a refresh
const MAX = 90; // px the indicator travels
const RESIST = 0.55; // drag resistance

// Admin read-only view pages where a refresh is safe (dashboard, lists, reports).
// Editor/form routes (invoice edit, product/customer forms, /new, settings, …) are
// deliberately excluded so a half-filled form can't be reloaded by accident — new
// admin views opt in here; new editors stay safe by default. Storefront pages are
// always on.
const ADMIN_PTR_OK = new Set([
  "/admin",
  "/admin/invoices",
  "/admin/customers",
  "/admin/products",
  "/admin/orders",
  "/admin/reports",
  "/admin/notifications",
]);

// Checked live at gesture time (not at mount): this component sits in the root
// layout and never remounts across client navigations, so a once-at-mount path
// check goes stale the moment the user navigates.
function pullAllowedHere() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (!path.startsWith("/admin")) return true; // storefront: always on
  return ADMIN_PTR_OK.has(path);
}

function scrollTop() {
  return Math.max(
    window.scrollY || 0,
    document.scrollingElement?.scrollTop || 0,
    document.documentElement?.scrollTop || 0,
    document.body?.scrollTop || 0,
  );
}

export function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const activeRef = useRef(false);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("ontouchstart" in window)) return;

    const set = (v: number) => { pullRef.current = v; setPull(v); };

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1 || !pullAllowedHere()) { startY.current = null; return; }
      startY.current = scrollTop() <= 0 ? e.touches[0].clientY : null;
      activeRef.current = false;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current == null || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startY.current;
      // Only engage while still at the very top and pulling downward.
      if (dy > 0 && scrollTop() <= 0) {
        activeRef.current = true;
        set(Math.min(MAX, dy * RESIST));
        if (e.cancelable) e.preventDefault(); // suppress the native overscroll/bounce
      } else if (dy <= 0) {
        activeRef.current = false;
        set(0);
      }
    };
    const onEnd = () => {
      if (startY.current == null) return;
      if (activeRef.current && pullRef.current >= THRESHOLD && !refreshingRef.current) {
        refreshingRef.current = true;
        setRefreshing(true);
        set(MAX);
        setTimeout(() => window.location.reload(), 200);
      } else {
        set(0);
      }
      startY.current = null;
      activeRef.current = false;
    };

    // Non-passive touchmove so preventDefault works; attach to document for the
    // widest webview compatibility (iOS standalone included).
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const visible = pull > 0 || refreshing;
  const ready = pull >= THRESHOLD || refreshing;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div
        className={`mt-2 flex h-10 w-10 items-center justify-center rounded-full border bg-white shadow-md ${ready ? "border-olive-400" : "border-olive-200"}`}
        style={{
          transform: `translateY(${visible ? Math.max(pull, refreshing ? 52 : 0) - 52 : -52}px)`,
          opacity: visible ? 1 : 0,
          transition: activeRef.current ? "none" : "transform .2s ease, opacity .2s ease",
        }}
      >
        <RefreshCw
          className={`h-5 w-5 ${ready ? "text-olive-800" : "text-olive-500"} ${refreshing ? "animate-spin" : ""}`}
          style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }}
        />
      </div>
    </div>
  );
}
