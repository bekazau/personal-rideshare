"use client";

import { useState, useTransition } from "react";
import { signInWithMagicLink } from "@/app/actions/auth";

export function SignInForm({ next }: { next?: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          setError(null);
          setMessage(null);
          const result = await signInWithMagicLink(formData);
          if (result?.error) setError(result.error);
          else if (result?.sent) {
            setMessage("Check your email for the sign-in link.");
          }
        })
      }
      className="space-y-3"
    >
      <input type="hidden" name="next" value={next || "/driver"} />
      <input
        type="email"
        name="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-4 py-3 text-base focus:outline-none focus:border-neutral-600"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-white text-neutral-950 font-medium py-3 hover:bg-neutral-200 transition disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send magic link"}
      </button>
      {message && <p className="text-sm text-emerald-400 text-center">{message}</p>}
      {error && <p className="text-sm text-rose-400 text-center">{error}</p>}
    </form>
  );
}
