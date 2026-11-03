"use client";

import { useRef } from "react";

export function SelfPurchaseForm({
  childId,
  displayName,
  canSelfPurchase,
  action
}: {
  childId: string;
  displayName: string;
  canSelfPurchase: boolean;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    const checked = (form.elements.namedItem("can_self_purchase") as HTMLInputElement | null)?.checked ?? false;
    if (checked === canSelfPurchase) {
      e.preventDefault();
      window.alert(`${displayName} already ${canSelfPurchase ? "can" : "cannot"} buy books.`);
      return;
    }
    const message = checked
      ? `Allow ${displayName} to buy books?`
      : `Remove ${displayName}'s permission to buy books?`;
    if (!window.confirm(message)) {
      e.preventDefault();
    }
  }

  return (
    <form ref={formRef} action={action} className="stack" onSubmit={onSubmit}>
      <input type="hidden" name="child_id" value={childId} />
      <label>
        <input type="checkbox" name="can_self_purchase" defaultChecked={canSelfPurchase} />
        Can buy books
      </label>
      <button type="submit" className="btn secondary">
        Save permission
      </button>
    </form>
  );
}
