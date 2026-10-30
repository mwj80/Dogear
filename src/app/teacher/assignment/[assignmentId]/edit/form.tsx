"use client";

import { useState } from "react";
import { removeAssignment, updateAssignment } from "../../../actions";

export function EditForm({
  assignment,
  books
}: {
  assignment: {
    id: string;
    title: string;
    criteria_type: string;
    pages: number | null;
    book_id: string;
    due_date: string | null;
  };
  books: { id: string; title: string }[];
}) {
  const [goal, setGoal] = useState(
    assignment.criteria_type === "finish_book" ? "finish" : "pages"
  );
  const [saved, setSaved] = useState(false);

  async function handleSave(formData: FormData) {
    await updateAssignment(formData);
    setSaved(true);
  }

  return (
    <>
      {saved && (
        <div className="banner unlocked">
          Assignment saved.
        </div>
      )}
      <form action={handleSave} className="stack">
        <input type="hidden" name="assignment_id" value={assignment.id} />
        <label>
          Title
          <input name="title" required maxLength={60} defaultValue={assignment.title} />
        </label>
        <label>
          Book
          <select name="book_id" defaultValue={assignment.book_id} required>
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
            <input
              name="pages"
              type="number"
              min="1"
              step="1"
              defaultValue={assignment.pages ?? 20}
              required
            />
          </label>
        )}
        <label>
          Due date
          <input name="due_date" type="date" defaultValue={assignment.due_date ?? ""} />
        </label>
        <button type="submit" className="btn">
          Save assignment
        </button>
      </form>
      <form action={removeAssignment}>
        <input type="hidden" name="assignment_id" value={assignment.id} />
        <button type="submit" className="btn secondary">
          Remove assignment
        </button>
      </form>
    </>
  );
}
