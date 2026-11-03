"use client";

export function RemoveKidForm({
  childId,
  displayName,
  action
}: {
  childId: string;
  displayName: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const ok = window.confirm(
      `Remove ${displayName}? This deletes their reading progress and rewards. Ledger history stays.`
    );
    if (!ok) e.preventDefault();
  }

  return (
    <form action={action} className="stack" onSubmit={onSubmit}>
      <input type="hidden" name="child_id" value={childId} />
      <button type="submit" className="btn secondary">
        Remove {displayName}
      </button>
      <p className="muted">
        Removes this kid, their reading progress, and their rewards. Ledger history stays.
      </p>
    </form>
  );
}
