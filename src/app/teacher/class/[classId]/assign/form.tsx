"use client";

import { useState } from "react";
import { createAssignment } from "../../../actions";

export function AssignForm({
  classId,
  books
}: {
  classId: string;
  books: { id: string; title: string }[];
}) {
  const [goal, setGoal] = useState("finish");
  const [added, setAdded] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    const title = await createAssignment(formData);
    setAdded(title);
    const form = document.querySelector("form");
    if (form instanceof HTMLFormElement) form.reset();
    setGoal("finish");
  }

  return (
    <>
      {added && (
        <div className="banner unlocked">
          Assignment {added} Added.
        </div>
      )}
      <form action={handleSubmit} className="stack">
        <input type="hidden" name="class_id" value={classId} />
        <label>
          Assignment title
          <input name="title" required maxLength={60} />
        </label>
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
        <label>
          Goal
          <select name="goal" value={goal} onChange={(e) => setGoal(e.target.value)}>
            <option value="finish">Finish the book</option>
            <option value="pages">Read N pages</option>
          </select>
        </label>
        {goal === "pages" && (
          <label>
            Pages
            <input name="pages" type="number" min="1" step="1" defaultValue="20" required />
          </label>
        )}
        <label>
          Due date
          <input name="due_date" type="date" />
        </label>
        <button type="submit" className="btn">
          Assign
        </button>
      </form>
    </>
  );
}
