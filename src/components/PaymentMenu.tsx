"use client";

import { useState } from "react";
import { paymentOptionsForDriver, type PaymentOption } from "@/lib/payments";
import { formatUsd } from "@/lib/fare";
import type { DriverRow } from "@/lib/types/database";

interface Props {
  driver: Pick<
    DriverRow,
    "pay_cashapp" | "pay_venmo" | "pay_paypal" | "pay_zelle" | "pay_applepay" | "pay_cash_enabled"
  >;
  totalCents: number;
  onPaid?: (method: PaymentOption["id"]) => void;
}

export function PaymentMenu({ driver, totalCents, onPaid }: Props) {
  const options = paymentOptionsForDriver(driver, totalCents);
  const [manualOpen, setManualOpen] = useState<PaymentOption | null>(null);

  if (options.length === 0) {
    return (
      <p className="text-sm text-neutral-400 italic">
        Driver hasn&apos;t set up any payment methods. Contact them directly.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-neutral-300">
        Pay {formatUsd(totalCents)} via:
      </p>
      <div className="space-y-2">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => {
              if (opt.deepLink) {
                window.open(opt.deepLink, "_blank", "noopener");
              } else {
                setManualOpen(opt);
              }
              onPaid?.(opt.id);
            }}
            className="w-full rounded-xl bg-neutral-800 hover:bg-neutral-700 px-4 py-3 flex justify-between items-center"
          >
            <span className="font-medium">{opt.label}</span>
            <span className="text-xs text-neutral-400">{opt.hint}</span>
          </button>
        ))}
      </div>

      {manualOpen && (
        <div
          className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4"
          onClick={() => setManualOpen(null)}
        >
          <div
            className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 max-w-sm w-full space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">{manualOpen.label}</h3>
            {manualOpen.handle && (
              <p className="font-mono text-sm bg-neutral-950 rounded-lg p-3 break-all">
                {manualOpen.handle}
              </p>
            )}
            <p className="text-sm text-neutral-300">{manualOpen.manualInstruction}</p>
            <button
              onClick={() => setManualOpen(null)}
              className="w-full rounded-xl bg-white text-neutral-950 py-2 font-medium"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
