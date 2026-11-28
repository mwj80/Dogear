"use client";

import { useState } from "react";

export default function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const isLink = /^https?:\/\//i.test(code);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <button
      type="button"
      className="btn secondary"
      style={{ padding: "0.2rem 0.55rem", fontSize: "0.8rem" }}
      onClick={copy}
    >
      {copied ? "Copied" : isLink ? "Copy Link" : "Copy Code"}
    </button>
  );
}
