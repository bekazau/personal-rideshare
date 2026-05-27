import type { DriverRow, PaymentMethod } from "@/lib/types/database";

export interface PaymentOption {
  id: Exclude<PaymentMethod, "unpaid">;
  label: string;
  handle: string | null;
  hint: string;
  deepLink: string | null;
  manualInstruction: string | null;
}

export function paymentOptionsForDriver(
  driver: Pick<
    DriverRow,
    "pay_cashapp" | "pay_venmo" | "pay_paypal" | "pay_zelle" | "pay_applepay" | "pay_cash_enabled"
  >,
  totalCents: number
): PaymentOption[] {
  const dollars = (totalCents / 100).toFixed(2);
  const out: PaymentOption[] = [];

  if (driver.pay_cashapp) {
    const tag = driver.pay_cashapp.replace(/^\$/, "");
    out.push({
      id: "cashapp",
      label: "Cash App",
      handle: `$${tag}`,
      hint: `Send to $${tag}`,
      deepLink: `https://cash.app/$${tag}/${dollars}`,
      manualInstruction: null,
    });
  }

  if (driver.pay_venmo) {
    const tag = driver.pay_venmo.replace(/^@/, "");
    out.push({
      id: "venmo",
      label: "Venmo",
      handle: `@${tag}`,
      hint: `Send to @${tag}`,
      // Venmo's universal-link "pay" form opens the app on iOS/Android, with fallback to web.
      deepLink: `https://venmo.com/${tag}?txn=pay&amount=${dollars}&note=Ride`,
      manualInstruction: null,
    });
  }

  if (driver.pay_paypal) {
    const username = driver.pay_paypal.replace(/^@/, "");
    out.push({
      id: "paypal",
      label: "PayPal",
      handle: username,
      hint: `PayPal.Me/${username}`,
      deepLink: `https://paypal.me/${username}/${dollars}`,
      manualInstruction: null,
    });
  }

  if (driver.pay_zelle) {
    out.push({
      id: "zelle",
      label: "Zelle",
      handle: driver.pay_zelle,
      hint: "Send via your bank app",
      deepLink: null,
      manualInstruction:
        `Open your bank's app, send $${dollars} via Zelle to ${driver.pay_zelle}.`,
    });
  }

  if (driver.pay_applepay) {
    out.push({
      id: "applepay",
      label: "Apple Pay",
      handle: driver.pay_applepay,
      hint: "Send Apple Cash via Messages",
      deepLink: null,
      manualInstruction:
        `Open Messages on your iPhone, start a conversation with ${driver.pay_applepay}, and send $${dollars} via Apple Cash.`,
    });
  }

  if (driver.pay_cash_enabled) {
    out.push({
      id: "cash",
      label: "Cash on arrival",
      handle: null,
      hint: "Pay driver in person",
      deepLink: null,
      manualInstruction:
        `Hand $${dollars} to the driver in cash when they arrive or at the end of the ride.`,
    });
  }

  return out;
}
