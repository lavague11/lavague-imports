/** Status badge for a wholesale order request. */
export function OrderStatusPill({ status }: { status: string }) {
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  const cls: Record<string, string> = {
    SUBMITTED: "bg-amber-100 text-amber-800",
    QUOTED: "bg-sky-100 text-sky-800",
    APPROVED: "bg-emerald-100 text-emerald-700",
    DECLINED: "bg-red-100 text-red-700",
    CANCELLED: "bg-olive-100 text-olive-600",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls[status] ?? "bg-olive-100 text-olive-700"}`}>{label}</span>;
}
