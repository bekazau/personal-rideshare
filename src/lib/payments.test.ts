import { describe, expect, it } from "vitest";
import { paymentOptionsForDriver } from "./payments";

const EMPTY = {
  pay_cashapp: null,
  pay_venmo: null,
  pay_paypal: null,
  pay_zelle: null,
  pay_applepay: null,
  pay_cash_enabled: false,
};

describe("paymentOptionsForDriver", () => {
  it("returns no options when nothing enabled", () => {
    expect(paymentOptionsForDriver(EMPTY, 1500)).toEqual([]);
  });

  it("builds a Cash App deep link with prefilled amount", () => {
    const opts = paymentOptionsForDriver(
      { ...EMPTY, pay_cashapp: "$mytag" },
      2599
    );
    expect(opts).toHaveLength(1);
    expect(opts[0]).toMatchObject({
      id: "cashapp",
      label: "Cash App",
      handle: "$mytag",
      deepLink: "https://cash.app/$mytag/25.99",
    });
  });

  it("strips leading $ from Cash App tag", () => {
    const opts = paymentOptionsForDriver(
      { ...EMPTY, pay_cashapp: "$mytag" },
      1000
    );
    expect(opts[0].deepLink).not.toContain("$$");
  });

  it("strips leading @ from Venmo handle", () => {
    const opts = paymentOptionsForDriver(
      { ...EMPTY, pay_venmo: "@myhandle" },
      1500
    );
    expect(opts[0].deepLink).toContain("/myhandle?");
    expect(opts[0].deepLink).not.toContain("/@myhandle");
  });

  it("Zelle returns manual instructions (no deep link)", () => {
    const opts = paymentOptionsForDriver(
      { ...EMPTY, pay_zelle: "tom@example.com" },
      1500
    );
    expect(opts[0].deepLink).toBeNull();
    expect(opts[0].manualInstruction).toContain("tom@example.com");
    expect(opts[0].manualInstruction).toContain("15.00");
  });

  it("Apple Pay returns manual instructions (no deep link)", () => {
    const opts = paymentOptionsForDriver(
      { ...EMPTY, pay_applepay: "+15555550100" },
      2000
    );
    expect(opts[0].deepLink).toBeNull();
    expect(opts[0].manualInstruction).toContain("+15555550100");
    expect(opts[0].manualInstruction).toContain("20.00");
    expect(opts[0].manualInstruction).toContain("Messages");
  });

  it("Cash on arrival shows up only when enabled", () => {
    const opts = paymentOptionsForDriver(
      { ...EMPTY, pay_cash_enabled: true },
      1500
    );
    expect(opts).toHaveLength(1);
    expect(opts[0].id).toBe("cash");
  });

  it("returns methods in a stable order: cashapp, venmo, paypal, zelle, applepay, cash", () => {
    const opts = paymentOptionsForDriver(
      {
        pay_cashapp: "$a",
        pay_venmo: "@b",
        pay_paypal: "c",
        pay_zelle: "d@e.com",
        pay_applepay: "+1234",
        pay_cash_enabled: true,
      },
      1500
    );
    expect(opts.map((o) => o.id)).toEqual([
      "cashapp",
      "venmo",
      "paypal",
      "zelle",
      "applepay",
      "cash",
    ]);
  });
});
