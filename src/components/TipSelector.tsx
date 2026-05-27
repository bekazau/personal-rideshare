"use client";

import { useState } from "react";
import { formatUsd } from "@/lib/fare";

interface Props {
  baseFareCents: number;
  discountCents: number;
  onChange: (tipCents: number) => void;
}

const PRESETS = [0, 15, 20, 25];

export function TipSelector({ baseFareCents, discountCents, onChange }: Props) {
  const [selectedPct, setSelectedPct] = useState<number | "custom">(0);
  const [customCents, setCustomCents] = useState<number>(0);

  const fareAfterDiscount = Math.max(baseFareCents - discountCents, 0);
  const tipCents =
    selectedPct === "custom"
      ? customCents
      : Math.round((fareAfterDiscount * selectedPct) / 100);

  function pick(pct: number | "custom") {
    setSelectedPct(pct);
    if (pct === "custom") onChange(customCents);
    else onChange(Math.round((fareAfterDiscount * pct) / 100));
  }

  function changeCustom(dollars: string) {
    const cents = Math.max(0, Math.round(Number(dollars || "0") * 100));
    setCustomCents(cents);
    if (selectedPct === "custom") onChange(cents);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-neutral-400 uppercase tracking-wider">Tip</p>
      <div className="grid grid-cols-4 gap-2">
        {PRESETS.map((pct) => (
          <button
            key={pct}
            onClick={() => pick(pct)}
            className={`rounded-lg py-2 text-sm font-medium transition ${
              selectedPct === pct
                ? "bg-white text-neutral-950"
                : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
            }`}
          >
            {pct === 0 ? "None" : `${pct}%`}
          </button>
        ))}
      </div>
      <button
        onClick={() => pick("custom")}
        className={`w-full rounded-lg py-2 text-sm font-medium transition ${
          selectedPct === "custom"
            ? "bg-white text-neutral-950"
            : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
        }`}
      >
        Custom
      </button>
      {selectedPct === "custom" && (
        <input
          type="number"
          min="0"
          step="0.50"
          placeholder="0.00"
          inputMode="decimal"
          onChange={(e) => changeCustom(e.target.value)}
          className="input"
        />
      )}
      <p className="text-sm text-neutral-400 text-right">
        Tip: {formatUsd(tipCents)}
      </p>
    </div>
  );
}
