"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  pushSupported,
  registerServiceWorker,
  subscribeBrowserToPush,
} from "@/lib/push-client";
import { getBrowserPosition } from "@/lib/geo";
import { savePushSubscription } from "@/app/actions/push";
import { completeOnboarding } from "@/app/actions/driver";

type Step = "intro" | "push" | "home" | "payments" | "promo" | "done";

interface State {
  displayName: string;
  baseFareDollars: string;
  pushReady: boolean;
  homeLat: number | null;
  homeLng: number | null;
  homeRadius: number;
  payCashapp: string;
  payVenmo: string;
  payPaypal: string;
  payZelle: string;
  payApplepay: string;
  payCashEnabled: boolean;
  firstRideFreeOn: boolean;
  firstRideDiscountPct: number;
}

const INITIAL: State = {
  displayName: "",
  baseFareDollars: "15",
  pushReady: false,
  homeLat: null,
  homeLng: null,
  homeRadius: 500,
  payCashapp: "",
  payVenmo: "",
  payPaypal: "",
  payZelle: "",
  payApplepay: "",
  payCashEnabled: true,
  firstRideFreeOn: false,
  firstRideDiscountPct: 100,
};

export function OnboardingWizard({ initialDisplayName }: { initialDisplayName: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("intro");
  const [state, setState] = useState<State>({ ...INITIAL, displayName: initialDisplayName });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const update = (patch: Partial<State>) => setState((s) => ({ ...s, ...patch }));

  async function handleEnablePush() {
    setError(null);
    if (!pushSupported()) {
      setError(
        "This browser doesn't support push notifications. On iPhone, make sure you opened the site in Safari and added it to the home screen."
      );
      return;
    }
    try {
      await registerServiceWorker();
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setError("You denied notifications. The pager model needs them to work.");
        return;
      }
      const sub = await subscribeBrowserToPush();
      const result = await savePushSubscription(sub);
      if (result.error) {
        setError(result.error);
        return;
      }
      update({ pushReady: true });
      setStep("home");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleCaptureHome() {
    setError(null);
    try {
      const pos = await getBrowserPosition();
      update({ homeLat: pos.coords.latitude, homeLng: pos.coords.longitude });
    } catch (e) {
      setError("Couldn't get your location: " + (e as Error).message);
    }
  }

  function handleFinish() {
    setError(null);
    const baseFareCents = Math.round(Number(state.baseFareDollars || "0") * 100);

    startTransition(async () => {
      const result = await completeOnboarding({
        displayName: state.displayName,
        baseFareCents,
        homeLat: state.homeLat,
        homeLng: state.homeLng,
        homeRadiusMeters: state.homeRadius,
        payCashapp: state.payCashapp || null,
        payVenmo: state.payVenmo || null,
        payPaypal: state.payPaypal || null,
        payZelle: state.payZelle || null,
        payApplepay: state.payApplepay || null,
        payCashEnabled: state.payCashEnabled,
        firstRideFreeOn: state.firstRideFreeOn,
        firstRideDiscountPct: state.firstRideDiscountPct,
      });

      if (result.error) {
        setError(result.error);
        return;
      }
      setInviteCode(result.inviteCode ?? null);
      setStep("done");
    });
  }

  return (
    <main className="flex-1 flex flex-col px-6 py-8 max-w-md mx-auto w-full">
      <StepHeader step={step} />

      {step === "intro" && (
        <section className="space-y-4 mt-6">
          <Field label="Your name (riders see this)">
            <input
              type="text"
              value={state.displayName}
              onChange={(e) => update({ displayName: e.target.value })}
              className="input"
              placeholder="Tom"
            />
          </Field>
          <Field label="Base fare per ride (USD)">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.50"
              value={state.baseFareDollars}
              onChange={(e) => update({ baseFareDollars: e.target.value })}
              className="input"
            />
          </Field>
          <PrimaryButton onClick={() => setStep("push")} disabled={!state.displayName.trim()}>
            Continue
          </PrimaryButton>
        </section>
      )}

      {step === "push" && (
        <section className="space-y-4 mt-6">
          <p className="text-sm text-neutral-300 leading-relaxed">
            Riders ping you with a push notification when they need a ride. This
            is how the app works while you&apos;re driving for Uber. Allow
            notifications now.
          </p>
          <PrimaryButton onClick={handleEnablePush}>
            Allow notifications
          </PrimaryButton>
          <button
            className="text-xs text-neutral-500 underline mx-auto block"
            onClick={() => setStep("home")}
          >
            Skip for now (you&apos;ll miss ride requests)
          </button>
        </section>
      )}

      {step === "home" && (
        <section className="space-y-4 mt-6">
          <p className="text-sm text-neutral-300 leading-relaxed">
            Set a <strong>home base</strong>. When you&apos;re within this
            radius of home, your location won&apos;t update for riders — so they
            never see your home address.
          </p>
          <PrimaryButton onClick={handleCaptureHome}>
            {state.homeLat ? "Re-capture current location" : "Use current location"}
          </PrimaryButton>
          {state.homeLat && state.homeLng && (
            <p className="text-xs text-neutral-500">
              Saved: {state.homeLat.toFixed(4)}, {state.homeLng.toFixed(4)}
            </p>
          )}
          <Field label={`Privacy radius: ${state.homeRadius} meters`}>
            <input
              type="range"
              min="100"
              max="2000"
              step="50"
              value={state.homeRadius}
              onChange={(e) => update({ homeRadius: Number(e.target.value) })}
              className="w-full"
            />
          </Field>
          <PrimaryButton onClick={() => setStep("payments")}>Continue</PrimaryButton>
          <button
            className="text-xs text-neutral-500 underline mx-auto block"
            onClick={() => setStep("payments")}
          >
            Skip — I&apos;ll set this later
          </button>
        </section>
      )}

      {step === "payments" && (
        <section className="space-y-3 mt-6">
          <p className="text-sm text-neutral-300 leading-relaxed">
            Which payment methods will you accept? Fill in any you want; leave
            the rest blank.
          </p>
          <Field label="Cash App $tag">
            <input
              className="input"
              placeholder="$yourtag"
              value={state.payCashapp}
              onChange={(e) => update({ payCashapp: e.target.value })}
            />
          </Field>
          <Field label="Venmo @handle">
            <input
              className="input"
              placeholder="@yourhandle"
              value={state.payVenmo}
              onChange={(e) => update({ payVenmo: e.target.value })}
            />
          </Field>
          <Field label="PayPal.Me username">
            <input
              className="input"
              placeholder="username"
              value={state.payPaypal}
              onChange={(e) => update({ payPaypal: e.target.value })}
            />
          </Field>
          <Field label="Zelle (email or phone)">
            <input
              className="input"
              placeholder="you@example.com"
              value={state.payZelle}
              onChange={(e) => update({ payZelle: e.target.value })}
            />
          </Field>
          <Field label="Apple Pay / Apple Cash (email or phone)">
            <input
              className="input"
              placeholder="+15555550100"
              value={state.payApplepay}
              onChange={(e) => update({ payApplepay: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-3 text-sm py-2">
            <input
              type="checkbox"
              checked={state.payCashEnabled}
              onChange={(e) => update({ payCashEnabled: e.target.checked })}
            />
            Accept cash on arrival
          </label>
          <PrimaryButton onClick={() => setStep("promo")}>Continue</PrimaryButton>
        </section>
      )}

      {step === "promo" && (
        <section className="space-y-4 mt-6">
          <p className="text-sm text-neutral-300 leading-relaxed">
            Offer new riders a discounted first ride with you? You fund this
            out of pocket — it&apos;s a way to win first-time riders over.
          </p>
          <label className="flex items-center gap-3 text-sm py-2">
            <input
              type="checkbox"
              checked={state.firstRideFreeOn}
              onChange={(e) => update({ firstRideFreeOn: e.target.checked })}
            />
            Enable first-ride discount
          </label>
          {state.firstRideFreeOn && (
            <Field label={`Discount on first ride: ${state.firstRideDiscountPct}%`}>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={state.firstRideDiscountPct}
                onChange={(e) => update({ firstRideDiscountPct: Number(e.target.value) })}
                className="w-full"
              />
            </Field>
          )}
          <PrimaryButton onClick={handleFinish} disabled={pending}>
            {pending ? "Setting up…" : "Finish setup"}
          </PrimaryButton>
        </section>
      )}

      {step === "done" && inviteCode && (
        <section className="space-y-4 mt-6 text-center">
          <h2 className="text-xl font-semibold">You&apos;re live.</h2>
          <p className="text-sm text-neutral-300">
            Share this link with riders you want to add to your circle:
          </p>
          <p className="font-mono text-sm break-all bg-neutral-900 rounded-xl p-3 border border-neutral-800">
            {typeof window !== "undefined" ? window.location.origin : ""}/ride/{inviteCode}
          </p>
          <PrimaryButton onClick={() => router.push("/driver/dashboard")}>
            Go to dashboard
          </PrimaryButton>
        </section>
      )}

      {error && (
        <p className="text-sm text-rose-400 mt-4 text-center">{error}</p>
      )}
    </main>
  );
}

function StepHeader({ step }: { step: Step }) {
  const titles: Record<Step, string> = {
    intro: "Welcome",
    push: "Push notifications",
    home: "Home base privacy",
    payments: "Payment methods",
    promo: "First-ride discount",
    done: "All set",
  };
  return (
    <header className="text-center">
      <h1 className="text-2xl font-semibold">{titles[step]}</h1>
      <p className="text-xs text-neutral-500 mt-1 uppercase tracking-wider">
        Driver setup
      </p>
    </header>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-neutral-400">{label}</span>
      {children}
    </label>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-xl bg-white text-neutral-950 font-medium py-3 hover:bg-neutral-200 transition disabled:opacity-50"
    >
      {children}
    </button>
  );
}
