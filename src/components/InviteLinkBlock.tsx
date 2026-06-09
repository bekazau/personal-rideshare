"use client";

import { useState } from "react";

export function InviteLinkBlock({
  inviteCode,
  title = "Your invite link",
}: {
  inviteCode: string;
  title?: string;
}) {
  const url =
    typeof window !== "undefined" ? `${window.location.origin}/ride/${inviteCode}` : "";
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      const sel = window.getSelection();
      const range = document.createRange();
      const el = document.getElementById(`invite-link-${inviteCode}`);
      if (el && sel) {
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }

  async function share() {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({
          url,
          title: "Join my rideshare",
          text: "Tap to request a ride with me.",
        });
        return;
      } catch {
        // user cancelled — fall through to copy
      }
    }
    copy();
  }

  return (
    <section className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4 space-y-3">
      <p className="text-xs text-neutral-400 uppercase tracking-wider">{title}</p>
      <p
        id={`invite-link-${inviteCode}`}
        className="text-sm font-mono break-all"
        suppressHydrationWarning
      >
        {url}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={copy}
          className="rounded-xl bg-neutral-800 text-neutral-100 py-2 text-sm font-medium hover:bg-neutral-700"
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
        <button
          onClick={share}
          className="rounded-xl bg-white text-neutral-950 py-2 text-sm font-medium hover:bg-neutral-200"
        >
          Share
        </button>
      </div>
    </section>
  );
}
