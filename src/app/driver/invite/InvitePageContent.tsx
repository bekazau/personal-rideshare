"use client";

import QRCode from "react-qr-code";
import { InviteLinkBlock } from "@/components/InviteLinkBlock";

export function InvitePageContent({ inviteCode }: { inviteCode: string }) {
  const url =
    typeof window !== "undefined" ? `${window.location.origin}/ride/${inviteCode}` : "";

  return (
    <>
      <p className="text-sm text-neutral-400">
        Share this with anyone you want to give rides to. They scan or tap, and
        they&apos;re your rider.
      </p>

      {url && (
        <div className="rounded-2xl bg-white p-4 flex justify-center" suppressHydrationWarning>
          <QRCode value={url} size={220} level="M" />
        </div>
      )}

      <InviteLinkBlock inviteCode={inviteCode} />
    </>
  );
}
