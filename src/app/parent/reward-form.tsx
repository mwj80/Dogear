"use client";

import { useMemo, useState } from "react";
import { createFinishReward } from "./actions";

type Kid = { id: string; display_name: string };
type Book = { id: string; title: string };

export default function RewardForm({ kids, books }: { kids: Kid[]; books: Book[] }) {
  const [scope, setScope] = useState("book");
  const [goal, setGoal] = useState("reach");

  const goals = useMemo(
    () =>
      scope === "any"
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
    [scope]
  );

  function onScope(next: string) {
    setScope(next);
    if (next === "any" && (goal === "reach" || goal === "finish")) {
      setGoal("read");
    }
  }

  const showPages = goal !== "finish";
  const showDays = goal === "streak";
  const showBook = scope === "book";

  return (
    <form action={createFinishReward} className="stack">
      <label>
        Kid
        <select name="child_id" required>
          {kids.map((kid) => (
            <option key={kid.id} value={kid.id}>
              {kid.display_name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Counts for
        <select name="scope" value={scope} onChange={(e) => onScope(e.target.value)}>
          <option value="book">This book</option>
          <option value="any">Any book</option>
        </select>
      </label>
      {showBook && (
        <label>
          Book
          <select name="book_id" required>
            {books.map((book) => (
              <option key={book.id} value={book.id}>
                {book.title}
              </option>
            ))}
          </select>
        </label>
      )}
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
      {showPages && (
        <label>
          {goal === "reach"
            ? "Page to reach"
            : goal === "streak"
              ? "Pages per day"
              : "Pages to read"}
          <input name="pages" type="number" min="1" step="1" defaultValue="10" required />
        </label>
      )}
      {showDays && (
        <label>
          Days in a row
          <input name="days" type="number" min="1" step="1" defaultValue="3" required />
        </label>
      )}
      <label>
        Type
        <select name="reward_type" defaultValue="robux">
          <option value="robux">Roblox Robux</option>
          <option value="gift_card">Gift card</option>
          <option value="pizza">Pizza coupon</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <label>
        Value the kid sees
        <input name="face_value" required placeholder="800 Robux" />
      </label>
      <button type="submit" className="btn">
        Save reward
      </button>
      <p>
        This book can reach a page, read N pages, finish, or keep a streak. Any book can read N pages or keep a streak (pages add across books). Cost is taken from the available balance (800 Robux → $6.00).
      </p>
    </form>
  );
}
