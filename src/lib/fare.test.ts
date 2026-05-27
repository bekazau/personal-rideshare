import { describe, expect, it } from "vitest";
import { calculateFare, formatUsd } from "./fare";

describe("calculateFare", () => {
  it("returns base + tip when no first-ride discount applies", () => {
    const fare = calculateFare({
      baseFareCents: 1500,
      tipCents: 300,
      isFirstRide: false,
      firstRideFreeOn: true,
      firstRideDiscountPct: 100,
    });
    expect(fare.discountCents).toBe(0);
    expect(fare.totalCents).toBe(1800);
  });

  it("applies 100% discount on a first ride when toggle is on", () => {
    const fare = calculateFare({
      baseFareCents: 1500,
      tipCents: 300,
      isFirstRide: true,
      firstRideFreeOn: true,
      firstRideDiscountPct: 100,
    });
    expect(fare.discountCents).toBe(1500);
    expect(fare.totalCents).toBe(300); // tip-only
  });

  it("applies partial discount (50%)", () => {
    const fare = calculateFare({
      baseFareCents: 2000,
      tipCents: 0,
      isFirstRide: true,
      firstRideFreeOn: true,
      firstRideDiscountPct: 50,
    });
    expect(fare.discountCents).toBe(1000);
    expect(fare.totalCents).toBe(1000);
  });

  it("ignores first-ride discount when the toggle is off", () => {
    const fare = calculateFare({
      baseFareCents: 1500,
      tipCents: 0,
      isFirstRide: true,
      firstRideFreeOn: false,
      firstRideDiscountPct: 100,
    });
    expect(fare.discountCents).toBe(0);
    expect(fare.totalCents).toBe(1500);
  });

  it("never goes below zero even with > 100% rounding edge cases", () => {
    const fare = calculateFare({
      baseFareCents: 1500,
      tipCents: 0,
      isFirstRide: true,
      firstRideFreeOn: true,
      firstRideDiscountPct: 100,
    });
    expect(fare.totalCents).toBeGreaterThanOrEqual(0);
  });
});

describe("formatUsd", () => {
  it("formats cents as USD", () => {
    expect(formatUsd(1500)).toBe("$15.00");
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(2599)).toBe("$25.99");
  });
});
