"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { setPostingGoalAction } from "@/lib/cadence-actions";

/** Change the weekly posting goal in place. */
export function GoalPicker({ clientId, goal }: { clientId?: string; goal: number }) {
  const t = useTranslations("cadence");
  const router = useRouter();
  const [value, setValue] = useState(goal);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const change = (g: number) => { setValue(g); setError(null); start(async () => {
    const r = await setPostingGoalAction({ clientId, goal: g });
    if (r.ok) router.refresh(); else { setValue(goal); setError(t(r.error === "not_set_up" ? "goalNotSetUp" : "goalFailed")); }
  }); };
  return (
    <label className="goal-picker">{t("goalLabel")}
      <select value={value} disabled={pending} onChange={(e) => change(Number(e.target.value))}>
        {[1, 2, 3, 4, 5, 6, 7, 10, 14].map((n) => <option key={n} value={n}>{t("perWeek", { count: n })}</option>)}
      </select>
      {error && <span className="error" role="alert">{error}</span>}
    </label>
  );
}
