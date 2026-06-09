"use client";

import { useEffect, useState } from "react";
import { useTransition } from "react";
import { signInWithMagicLink, verifyEmailOtp } from "@/app/actions/auth";

const LAST_EMAIL_KEY = "rideshare:lastEmail";

export function SignInForm({ next }: { next?: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [emailDraft, setEmailDraft] = useState("");

  // Restore the last-used email from localStorage so re-auth doesn't require
  // retyping it. Empty initial state matches SSR; we set it after hydration.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_EMAIL_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setEmailDraft(saved);
    } catch {
      // localStorage can be unavailable in some private/embedded contexts — ignore.
    }
  }, []);

  if (step === "code") {
    return (
      <form
        action={(formData) =>
          startTransition(async () => {
            setError(null);
            formData.set("email", email);
            const result = await verifyEmailOtp(formData);
            if (result?.error) setError(result.error);
            else {
              // Re-affirm last email on successful verify too.
              try {
                localStorage.setItem(LAST_EMAIL_KEY, email);
              } catch {
                // ignore
              }
            }
          })
        }
        className="space-y-3"
      >
        <input type="hidden" name="next" value={next || "/driver"} />
        <p className="text-sm text-neutral-400 text-center">
          Code sent to <span className="text-neutral-200">{email}</span>. Check
          your email for the sign-in code.
        </p>
        <input
          type="text"
          name="token"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6,10}"
          maxLength={10}
          placeholder="12345678"
          className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-4 py-3 text-2xl text-center tracking-[0.4em] focus:outline-none focus:border-neutral-600"
        />
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-white text-neutral-950 font-medium py-3 hover:bg-neutral-200 transition disabled:opacity-60"
        >
          {pending ? "Verifying…" : "Verify code"}
        </button>
        <button
          type="button"
          onClick={() => {
            setStep("email");
            setError(null);
          }}
          className="w-full text-sm text-neutral-400 hover:text-neutral-200 py-2"
        >
          Use a different email
        </button>
        {error && <p className="text-sm text-rose-400 text-center">{error}</p>}
      </form>
    );
  }

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          setError(null);
          const result = await signInWithMagicLink(formData);
          if (result?.error) setError(result.error);
          else if (result?.sent) {
            const submitted = String(formData.get("email") || "")
              .trim()
              .toLowerCase();
            setEmail(submitted);
            try {
              localStorage.setItem(LAST_EMAIL_KEY, submitted);
            } catch {
              // ignore
            }
            setStep("code");
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
        value={emailDraft}
        onChange={(e) => setEmailDraft(e.target.value)}
        placeholder="you@example.com"
        className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-4 py-3 text-base focus:outline-none focus:border-neutral-600"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-white text-neutral-950 font-medium py-3 hover:bg-neutral-200 transition disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send code"}
      </button>
      {error && <p className="text-sm text-rose-400 text-center">{error}</p>}
    </form>
  );
}
