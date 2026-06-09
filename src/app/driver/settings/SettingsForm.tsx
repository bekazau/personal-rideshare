"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateDriverSettings, updateHomeBase } from "@/app/actions/driver";
import { getBrowserPosition } from "@/lib/geo";
import { AppMenu } from "@/components/AppMenu";
import { InviteLinkBlock } from "@/components/InviteLinkBlock";
import type { DriverRow } from "@/lib/types/database";

export function SettingsForm({ driver }: { driver: DriverRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [displayName, setDisplayName] = useState(driver.display_name);
  const [baseFareDollars, setBaseFareDollars] = useState(
    (driver.base_fare_cents / 100).toString()
  );
  const [homeRadiusMiles, setHomeRadiusMiles] = useState(
    Math.round(((driver.home_radius_meters ?? 500) / 1609.344) * 10) / 10
  );
  const [homeLat, setHomeLat] = useState<number | null>(driver.home_lat);
  const [homeLng, setHomeLng] = useState<number | null>(driver.home_lng);
  const [homeCapturing, setHomeCapturing] = useState(false);
  const [homeMsg, setHomeMsg] = useState<string | null>(null);
  const [payCashapp, setPayCashapp] = useState(driver.pay_cashapp ?? "");
  const [payVenmo, setPayVenmo] = useState(driver.pay_venmo ?? "");
  const [payPaypal, setPayPaypal] = useState(driver.pay_paypal ?? "");
  const [payZelle, setPayZelle] = useState(driver.pay_zelle ?? "");
  const [payApplepay, setPayApplepay] = useState(driver.pay_applepay ?? "");
  const [payCashEnabled, setPayCashEnabled] = useState(driver.pay_cash_enabled);
  const [firstRideFreeOn, setFirstRideFreeOn] = useState(driver.first_ride_free_on);
  const [firstRideDiscountPct, setFirstRideDiscountPct] = useState(
    driver.first_ride_discount_pct
  );

  async function recaptureHome() {
    setHomeMsg(null);
    setError(null);
    setHomeCapturing(true);
    try {
      const pos = await getBrowserPosition();
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const result = await updateHomeBase(lat, lng);
      if (result.error) {
        setError(result.error);
        return;
      }
      setHomeLat(lat);
      setHomeLng(lng);
      setHomeMsg("Home base updated.");
    } catch (e) {
      setError("Couldn't get your location: " + (e as Error).message);
    } finally {
      setHomeCapturing(false);
    }
  }

  function save() {
    setError(null);
    setSaved(false);
    const baseFareCents = Math.round(Number(baseFareDollars || "0") * 100);
    startTransition(async () => {
      const result = await updateDriverSettings({
        displayName,
        baseFareCents,
        homeRadiusMeters: Math.round(homeRadiusMiles * 1609.344),
        payCashapp: payCashapp || null,
        payVenmo: payVenmo || null,
        payPaypal: payPaypal || null,
        payZelle: payZelle || null,
        payApplepay: payApplepay || null,
        payCashEnabled,
        firstRideFreeOn,
        firstRideDiscountPct,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <main className="flex-1 flex flex-col px-6 pt-safe pb-24 max-w-md mx-auto w-full space-y-4">
      <header className="flex items-start gap-3">
        <AppMenu />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Settings</h1>
        </div>
      </header>

      <Field label="Your name (riders see this)">
        <input
          type="text"
          className="input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </Field>

      <Field label="Base fare per ride (USD)">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.50"
          className="input"
          value={baseFareDollars}
          onChange={(e) => setBaseFareDollars(e.target.value)}
        />
      </Field>

      <Field label={`Home base privacy radius: ${homeRadiusMiles.toFixed(1)} mi`}>
        <input
          type="range"
          min="0.1"
          max="3"
          step="0.1"
          value={homeRadiusMiles}
          onChange={(e) => setHomeRadiusMiles(Number(e.target.value))}
          className="w-full"
        />
      </Field>

      <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4 space-y-2">
        <p className="text-xs text-neutral-400 uppercase tracking-wider">Home base location</p>
        {homeLat !== null && homeLng !== null ? (
          <p className="text-xs text-neutral-500 font-mono">
            {homeLat.toFixed(5)}, {homeLng.toFixed(5)}
          </p>
        ) : (
          <p className="text-xs text-neutral-500 italic">Not set</p>
        )}
        <button
          type="button"
          onClick={recaptureHome}
          disabled={homeCapturing}
          className="w-full rounded-xl bg-neutral-800 text-neutral-100 font-medium py-2 hover:bg-neutral-700 transition disabled:opacity-50"
        >
          {homeCapturing
            ? "Reading location…"
            : homeLat !== null
            ? "Recapture from current location"
            : "Use current location"}
        </button>
        {homeMsg && <p className="text-xs text-emerald-400">{homeMsg}</p>}
      </div>

      <fieldset className="space-y-3 border-t border-neutral-800 pt-4">
        <legend className="text-xs text-neutral-500 uppercase tracking-wider">
          Payment methods
        </legend>
        <Field label="Cash App $tag">
          <input
            className="input"
            placeholder="$yourtag"
            value={payCashapp}
            onChange={(e) => setPayCashapp(e.target.value)}
          />
        </Field>
        <Field label="Venmo @handle">
          <input
            className="input"
            placeholder="@yourhandle"
            value={payVenmo}
            onChange={(e) => setPayVenmo(e.target.value)}
          />
        </Field>
        <Field label="PayPal.Me username">
          <input
            className="input"
            placeholder="username"
            value={payPaypal}
            onChange={(e) => setPayPaypal(e.target.value)}
          />
        </Field>
        <Field label="Zelle (email or phone)">
          <input
            className="input"
            placeholder="you@example.com"
            value={payZelle}
            onChange={(e) => setPayZelle(e.target.value)}
          />
        </Field>
        <Field label="Apple Pay / Apple Cash (email or phone)">
          <input
            className="input"
            placeholder="+15555550100"
            value={payApplepay}
            onChange={(e) => setPayApplepay(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-3 text-sm py-1">
          <input
            type="checkbox"
            checked={payCashEnabled}
            onChange={(e) => setPayCashEnabled(e.target.checked)}
          />
          Accept cash on arrival
        </label>
      </fieldset>

      <fieldset className="space-y-3 border-t border-neutral-800 pt-4">
        <legend className="text-xs text-neutral-500 uppercase tracking-wider">
          First-ride promo
        </legend>
        <label className="flex items-center gap-3 text-sm py-1">
          <input
            type="checkbox"
            checked={firstRideFreeOn}
            onChange={(e) => setFirstRideFreeOn(e.target.checked)}
          />
          Enable first-ride discount
        </label>
        {firstRideFreeOn && (
          <Field label={`Discount on first ride: ${firstRideDiscountPct}%`}>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={firstRideDiscountPct}
              onChange={(e) => setFirstRideDiscountPct(Number(e.target.value))}
              className="w-full"
            />
          </Field>
        )}
      </fieldset>

      <div className="border-t border-neutral-800 pt-4 space-y-3">
        <button
          onClick={save}
          disabled={pending || !displayName.trim()}
          className="w-full rounded-xl bg-white text-neutral-950 font-medium py-3 hover:bg-neutral-200 transition disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {error && <p className="text-sm text-rose-400 text-center">{error}</p>}
        {saved && !error && (
          <p className="text-sm text-emerald-400 text-center">Saved.</p>
        )}
      </div>

      <div className="mt-4">
        <InviteLinkBlock inviteCode={driver.invite_code} />
      </div>
    </main>
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
