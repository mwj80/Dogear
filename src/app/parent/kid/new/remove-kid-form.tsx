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
    <form action={action} style={{ marginTop: "1.25rem" }} onSubmit={onSubmit}>
      <input type="hidden" name="child_id" value={childId} />
      <button
        type="submit"
        className="btn secondary"
        style={{ fontSize: "0.8rem", padding: "0.25rem 0.6rem", opacity: 0.7 }}
      >
        Remove kid
      </button>
    </form>
  );
}
