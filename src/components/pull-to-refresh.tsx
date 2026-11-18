"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

// Pull-to-refresh for touch devices: swipe down while scrolled to the very top
// to reload the page. A small spinner follows the pull and spins on release.
// Storefront only (skips /admin so it can't reload a half-filled form).
const THRESHOLD = 70; // px of pull needed to trigger a refresh
const MAX = 90; // px the indicator travels

export function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const activeRef = useRef(false);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("ontouchstart" in window)) return;
    if (window.location.pathname.startsWith("/admin")) return;

    const set = (v: number) => { pullRef.current = v; setPull(v); };

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (window.scrollY <= 0 && e.touches.length === 1) {
        startY.current = e.touches[0].clientY;
        activeRef.current = false;
      } else {
        startY.current = null;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current == null || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0 && window.scrollY <= 0) {
        activeRef.current = true;
        set(Math.min(MAX, dy * 0.5));
        if (e.cancelable) e.preventDefault(); // suppress native overscroll while pulling
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
        setTimeout(() => window.location.reload(), 150);
      } else {
        set(0);
      }
      startY.current = null;
      activeRef.current = false;
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const visible = pull > 0 || refreshing;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center">
      <div
        className="mt-2 flex h-9 w-9 items-center justify-center rounded-full border border-olive-200 bg-white shadow-md"
        style={{
          transform: `translateY(${visible ? Math.max(pull, refreshing ? 48 : 0) - 48 : -48}px)`,
          opacity: visible ? 1 : 0,
          transition: activeRef.current ? "none" : "transform .2s ease, opacity .2s ease",
        }}
      >
        <RefreshCw
          className={`h-4 w-4 text-olive-700 ${refreshing ? "animate-spin" : ""}`}
          style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }}
        />
      </div>
    </div>
  );
}
