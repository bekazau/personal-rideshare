"use client";

import { useState } from "react";
import { updateRiderName } from "@/app/actions/rider";
import { RiderMenu } from "@/components/RiderMenu";

export function RiderSettingsForm({
  inviteCode,
  initialName,
}: {
  inviteCode: string;
  initialName: string;
}) {
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState(false);

  async function save() {
    setError(null);
    setSavedMsg(false);
    setSaving(true);
    const result = await updateRiderName(name);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSavedName(name.trim());
    setSavedMsg(true);
  }

  return (
    <main className="flex-1 flex flex-col px-6 pt-safe pb-24 max-w-md mx-auto w-full space-y-4">
      <header className="flex items-start gap-3">
        <RiderMenu inviteCode={inviteCode} />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Settings</h1>
        </div>
      </header>

      <section className="space-y-2">
        <label className="block space-y-1">
          <span className="text-xs text-neutral-400 uppercase tracking-wider">
            Your name
          </span>
          <input
            type="text"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What should your driver call you?"
          />
        </label>
        <p className="text-xs text-neutral-500">
          This is the name your driver sees in their riders list and chat.
        </p>
        <button
          onClick={save}
          disabled={saving || !name.trim() || name.trim() === savedName}
          className="w-full rounded-xl bg-white text-neutral-950 font-medium py-3 hover:bg-neutral-200 transition disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {savedMsg && !error && (
          <p className="text-sm text-emerald-400 text-center">Saved.</p>
        )}
        {error && <p className="text-sm text-rose-400 text-center">{error}</p>}
      </section>
    </main>
  );
}
