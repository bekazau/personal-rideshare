export interface FareBreakdown {
  baseCents: number;
  discountCents: number;
  tipCents: number;
  totalCents: number;
  isFirstRide: boolean;
}

export interface FareInput {
  baseFareCents: number;
  tipCents: number;
  isFirstRide: boolean;
  firstRideFreeOn: boolean;
  firstRideDiscountPct: number;
}

export function calculateFare(input: FareInput): FareBreakdown {
  const { baseFareCents, tipCents, isFirstRide, firstRideFreeOn, firstRideDiscountPct } = input;

  const applyDiscount = isFirstRide && firstRideFreeOn;
  const discountCents = applyDiscount
    ? Math.round((baseFareCents * firstRideDiscountPct) / 100)
    : 0;

  const totalCents = Math.max(baseFareCents - discountCents, 0) + tipCents;

  return {
    baseCents: baseFareCents,
    discountCents,
    tipCents,
    totalCents,
    isFirstRide,
  };
}

export function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}
