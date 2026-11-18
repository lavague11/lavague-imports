"use client";

import { useState } from "react";

import { setMonthlyGoal } from "@/app/admin/actions";

const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** Optional monthly revenue goal with a progress bar (DASHBOARD §1b). */
export function GoalCard({ current, goal }: { current: number; goal: number }) {
  const [editing, setEditing] = useState(false);
  const pct = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;

  return (
    <div className="rounded-xl border border-olive-100 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-olive-800">Monthly goal</p>
        <button type="button" onClick={() => setEditing((e) => !e)} className="text-xs text-olive-500 hover:text-olive-800">{goal > 0 ? "Edit" : "Set goal"}</button>
      </div>

      {editing ? (
        <form action={setMonthlyGoal} className="mt-2 flex items-center gap-2" onSubmit={() => setEditing(false)}>
          <span className="text-sm text-olive-400">$</span>
          <input name="goal" defaultValue={goal > 0 ? (goal / 100).toFixed(0) : ""} inputMode="decimal" placeholder="Monthly revenue goal" className="h-9 w-full rounded-lg border border-olive-200 px-2.5 text-sm focus:border-olive-500 focus:outline-none" />
          <button className="h-9 rounded-lg bg-olive-900 px-3 text-sm font-medium text-white hover:bg-olive-800">Save</button>
        </form>
      ) : goal > 0 ? (
        <>
          <p className="mt-1 text-lg font-semibold text-olive-900">{money(current)} <span className="text-sm font-normal text-olive-400">of {money(goal)}</span></p>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-olive-100">
            <div className={`h-full ${pct >= 100 ? "bg-emerald-500" : "bg-olive-700"}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-olive-500">{pct}% of goal this month</p>
        </>
      ) : (
        <p className="mt-2 text-sm text-olive-400">No goal set. Track your month against a target.</p>
      )}
    </div>
  );
}
