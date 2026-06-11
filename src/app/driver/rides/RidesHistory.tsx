"use client";

import { AppMenu } from "@/components/AppMenu";
import { formatUsd } from "@/lib/fare";
import type { PaymentMethod, RideStatus } from "@/lib/types/database";

export interface RideEntry {
  id: string;
  status: RideStatus;
  pickup_address: string;
  dropoff_address: string | null;
  base_fare_cents: number;
  total_cents: number;
  scheduled_for: string | null;
  requested_at: string;
  completed_at: string | null;
  paid_at: string | null;
  payment_method: PaymentMethod;
}

const CURRENT: RideStatus[] = [
  "pending",
  "quoted",
  "accepted",
  "en_route",
  "arrived",
  "in_progress",
];

const STATUS_LABEL: Record<RideStatus, string> = {
  pending: "New request",
  quoted: "Quote sent",
  accepted: "Accepted",
  en_route: "On the way",
  arrived: "Arrived",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  declined: "Declined",
};

const STATUS_COLOR: Record<RideStatus, string> = {
  pending: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  quoted: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  accepted: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  en_route: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  arrived: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  in_progress: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  completed: "bg-neutral-700/40 text-neutral-300 border-neutral-600/50",
  cancelled: "bg-rose-500/10 text-rose-300 border-rose-500/30",
  declined: "bg-rose-500/10 text-rose-300 border-rose-500/30",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function priceLabel(ride: RideEntry): string {
  if (ride.total_cents > 0) return formatUsd(ride.total_cents);
  if (ride.base_fare_cents > 0) return formatUsd(ride.base_fare_cents);
  return "—";
}

export function RidesHistory({ rides }: { rides: RideEntry[] }) {
  const current = rides.filter((r) => CURRENT.includes(r.status));
  const past = rides.filter((r) => !CURRENT.includes(r.status));

  return (
    <main className="flex-1 flex flex-col px-6 pt-safe pb-24 max-w-md mx-auto w-full space-y-4">
      <header className="flex items-start gap-3">
        <AppMenu />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Rides</h1>
        </div>
      </header>

      {rides.length === 0 && (
        <p className="text-sm text-neutral-500">No rides yet.</p>
      )}

      {current.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-300">Current</h2>
          {current.map((r) => (
            <RideRow key={r.id} ride={r} />
          ))}
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-300">Past</h2>
          {past.map((r) => (
            <RideRow key={r.id} ride={r} />
          ))}
        </section>
      )}
    </main>
  );
}

function RideRow({ ride }: { ride: RideEntry }) {
  return (
    <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[ride.status]}`}
        >
          {STATUS_LABEL[ride.status]}
        </span>
        <span className="font-semibold">{priceLabel(ride)}</span>
      </div>

      <p className="text-sm font-medium truncate">{ride.pickup_address}</p>
      {ride.dropoff_address && (
        <p className="text-sm text-neutral-400 truncate">→ {ride.dropoff_address}</p>
      )}

      <div className="flex items-center justify-between gap-2 text-xs text-neutral-500 pt-0.5">
        <span>
          {ride.scheduled_for
            ? `⏰ ${formatDate(ride.scheduled_for)}`
            : formatDate(ride.requested_at)}
        </span>
        {ride.paid_at && ride.payment_method !== "unpaid" && (
          <span className="text-emerald-400">Paid · {ride.payment_method}</span>
        )}
      </div>
    </div>
  );
}
