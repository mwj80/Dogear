"use client";

export function PinForm({
  childId,
  hasPin,
  action
}: {
  childId: string;
  hasPin: boolean;
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action} className="stack">
      <input type="hidden" name="child_id" value={childId} />
      <label>
        {hasPin ? "New PIN" : "PIN"}
        <input
          name="pin"
          required
          inputMode="numeric"
          pattern="[0-9]{4}"
          maxLength={4}
          placeholder="4 digits"
        />
      </label>
      <button type="submit" className="btn secondary">
        {hasPin ? "Change PIN" : "Set PIN"}
      </button>
    </form>
  );
}
