"use client";

import { useMemo, useState } from "react";
import { removeReward, updateReward } from "./actions";

type Reward = {
  id: string;
  face_value: string;
  status: string;
  criteria_type: string;
  scope: string;
  pages: number | null;
  days: number | null;
  mode: string | null;
};

export default function RewardEditor({ reward }: { reward: Reward }) {
  const [open, setOpen] = useState(false);
  const initialGoal =
    reward.criteria_type === "daily_streak"
      ? "streak"
      : reward.criteria_type === "finish_book"
        ? "finish"
        : reward.mode === "read" || reward.scope === "any"
          ? "read"
          : "reach";
  const [goal, setGoal] = useState(initialGoal);

  const goals = useMemo(
    () =>
      reward.scope === "any"
        ? [
            { value: "read", label: "Read N pages" },
            { value: "streak", label: "Daily streak" }
          ]
        : [
            { value: "reach", label: "Reach a page" },
            { value: "read", label: "Read N pages" },
            { value: "finish", label: "Finish the book" },
            { value: "streak", label: "Daily streak" }
          ],
    [reward.scope]
  );

  if (reward.status !== "active") return null;

  return (
    <div className="reward-edit">
      <div className="reward-actions">
        <button type="button" className="btn secondary" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Edit"}
        </button>
        <form action={removeReward}>
          <input type="hidden" name="reward_id" value={reward.id} />
          <button type="submit" className="btn secondary">
            Remove
          </button>
        </form>
      </div>
      {open && (
        <form action={updateReward} className="stack">
          <input type="hidden" name="reward_id" value={reward.id} />
          <label>
            When
            <select name="goal" value={goal} onChange={(e) => setGoal(e.target.value)}>
              {goals.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {goal !== "finish" && (
            <label>
              {goal === "reach" ? "Page to reach" : goal === "streak" ? "Pages per day" : "Pages to read"}
              <input name="pages" type="number" min="1" step="1" defaultValue={reward.pages ?? 10} required />
            </label>
          )}
          {goal === "streak" && (
            <label>
              Days in a row
              <input name="days" type="number" min="1" step="1" defaultValue={reward.days ?? 3} required />
            </label>
          )}
          <label>
            Value the kid sees
            <input name="face_value" defaultValue={reward.face_value} required />
          </label>
          <button type="submit" className="btn">
            Save changes
          </button>
          <p className="muted">Book and scope stay as they are. Cost is recalculated from the value.</p>
        </form>
      )}
    </div>
  );
}
