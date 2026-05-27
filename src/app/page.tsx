import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="max-w-md w-full space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            Personal Rideshare
          </h1>
          <p className="text-neutral-400 leading-relaxed">
            A private rideshare between one driver and the riders they trust.
            No app store. No middleman. The driver keeps the whole fare.
          </p>
        </header>

        <div className="space-y-3">
          <Link
            href="/driver"
            className="block w-full rounded-2xl bg-white text-neutral-950 font-medium py-4 px-6 hover:bg-neutral-200 transition"
          >
            I&apos;m a driver
          </Link>
          <p className="text-xs text-neutral-500">
            Riders join via a personal invite link or QR code from their driver —
            there&apos;s no public &quot;rider&quot; signup.
          </p>
        </div>

        <footer className="text-xs text-neutral-600 pt-8 border-t border-neutral-900">
          Install to your home screen for the best experience. On iPhone, open
          this page in Safari, tap the Share button, then &quot;Add to Home
          Screen&quot;.
        </footer>
      </div>
    </main>
  );
}
