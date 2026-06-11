import { describe, expect, it, vi } from "vitest";
import { metersBetween, isInsideHomeZone, staleness, formatGeocodeArea } from "./geo";

describe("formatGeocodeArea", () => {
  it("appends the US state abbreviation from short_code", () => {
    expect(
      formatGeocodeArea({
        text: "Santa Rosa",
        context: [
          { id: "region.123", short_code: "US-CA", text: "California" },
          { id: "country.456", short_code: "us", text: "United States" },
        ],
      })
    ).toBe("Santa Rosa, CA");
  });

  it("falls back to the full region name when no short_code", () => {
    expect(
      formatGeocodeArea({
        text: "Anytown",
        context: [{ id: "region.1", text: "Some Province" }],
      })
    ).toBe("Anytown, Some Province");
  });

  it("returns just the name when there is no region context", () => {
    expect(formatGeocodeArea({ text: "Lonely Place", context: [] })).toBe("Lonely Place");
  });

  it("returns null when the feature has no name", () => {
    expect(formatGeocodeArea({ context: [] })).toBeNull();
    expect(formatGeocodeArea(undefined)).toBeNull();
  });
});

describe("metersBetween", () => {
  it("returns 0 for identical points", () => {
    expect(metersBetween(40.0, -74.0, 40.0, -74.0)).toBe(0);
  });

  it("approximates 1 degree of latitude as ~111 km", () => {
    const d = metersBetween(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it("is symmetric", () => {
    const a = metersBetween(40.7128, -74.006, 34.0522, -118.2437);
    const b = metersBetween(34.0522, -118.2437, 40.7128, -74.006);
    expect(a).toBeCloseTo(b, 1);
  });
});

describe("isInsideHomeZone", () => {
  const HOME = { lat: 40.0, lng: -74.0, radiusMeters: 500 };

  it("returns true at home center", () => {
    expect(isInsideHomeZone({ lat: 40.0, lng: -74.0 }, HOME)).toBe(true);
  });

  it("returns false far from home", () => {
    expect(isInsideHomeZone({ lat: 41.0, lng: -74.0 }, HOME)).toBe(false);
  });

  it("returns false when home is unset", () => {
    expect(
      isInsideHomeZone({ lat: 40, lng: -74 }, { lat: null, lng: null, radiusMeters: 500 })
    ).toBe(false);
  });
});

describe("staleness", () => {
  it("returns 'never seen' for null", () => {
    expect(staleness(null)).toBe("never seen");
  });

  it("returns 'just now' within a minute", () => {
    const now = new Date().toISOString();
    expect(staleness(now)).toBe("just now");
  });

  it("returns minutes for recent timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T12:00:00Z"));
    expect(staleness("2026-05-27T11:55:00Z")).toBe("5 min ago");
    expect(staleness("2026-05-27T11:00:00Z")).toBe("~1 hr ago");
    expect(staleness("2026-05-27T08:00:00Z")).toBe("4 hr ago");
    vi.useRealTimers();
  });
});
