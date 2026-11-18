/** Resolve a dashboard date-range key into current + previous windows
 *  (DASHBOARD §1b). Pure — safe on server and client. */
export interface RangeWindow {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
  label: string;
}

const DAY = 864e5;

export function rangeWindow(range: string, from?: string, to?: string, now: Date = new Date()): RangeWindow {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let start: Date;
  let end = now;
  let label: string;
  switch (range) {
    case "today": start = startOfDay(now); label = "Today"; break;
    case "7d": start = new Date(now.getTime() - 7 * DAY); label = "Last 7 days"; break;
    case "30d": start = new Date(now.getTime() - 30 * DAY); label = "Last 30 days"; break;
    case "year": start = new Date(now.getFullYear(), 0, 1); label = "This year"; break;
    case "custom": {
      start = from ? new Date(`${from}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), 1);
      end = to ? new Date(`${to}T23:59:59`) : now;
      label = "Custom"; break;
    }
    case "month":
    default: start = new Date(now.getFullYear(), now.getMonth(), 1); label = "This month"; break;
  }
  const len = Math.max(1, end.getTime() - start.getTime());
  return { start, end, prevStart: new Date(start.getTime() - len), prevEnd: start, label };
}
