"use client";

import { useState } from "react";

export default function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

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
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
      <code style={{ fontFamily: "ui-monospace, monospace", background: "#f5f0e8", padding: "0.15rem 0.4rem", borderRadius: "4px" }}>
        {code}
      </code>
      <button type="button" className="btn secondary" style={{ padding: "0.15rem 0.45rem", fontSize: "0.75rem" }} onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
