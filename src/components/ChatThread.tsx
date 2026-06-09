"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sendMessage, markThreadRead } from "@/app/actions/chat";
import type { MessageRow } from "@/lib/types/database";

interface Props {
  driverId: string;
  riderId: string;
  myRole: "driver" | "rider";
  otherName: string;
  initialMessages: MessageRow[];
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return "Yesterday";
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ChatThread({
  driverId,
  riderId,
  myRole,
  otherName,
  initialMessages,
}: Props) {
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Realtime: listen for new messages in this thread.
  useEffect(() => {
    const supabase = createClient();
    // Realtime postgres_changes filters accept ONE column; we filter by the
    // counter-party id and additionally check the local id in the callback.
    const counterFilter =
      myRole === "driver" ? `driver_id=eq.${driverId}` : `rider_id=eq.${riderId}`;

    const channel = supabase
      .channel(`chat-${driverId}-${riderId}-${myRole}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: counterFilter },
        (payload) => {
          const next = payload.new as MessageRow;
          if (!next) return;
          if (next.driver_id !== driverId || next.rider_id !== riderId) return;
          setMessages((curr) => {
            if (curr.some((m) => m.id === next.id)) return curr;
            return [...curr, next];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [driverId, riderId, myRole]);

  // Polling fallback every 10s + on visibility return.
  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("driver_id", driverId)
      .eq("rider_id", riderId)
      .order("created_at", { ascending: true });
    if (data) setMessages(data as MessageRow[]);
  }, [driverId, riderId]);

  useEffect(() => {
    const interval = setInterval(refresh, 10_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Mark counter-party messages as read on mount and whenever new ones arrive.
  useEffect(() => {
    markThreadRead({ driverId, riderId, readerRole: myRole }).catch(() => {});
  }, [driverId, riderId, myRole, messages.length]);

  async function send() {
    const text = body.trim();
    if (!text || sending) return;
    setError(null);
    setSending(true);

    // Optimistic append.
    const tempId = `temp-${Date.now()}`;
    const optimistic: MessageRow = {
      id: tempId,
      driver_id: driverId,
      rider_id: riderId,
      sender_role: myRole,
      body: text,
      created_at: new Date().toISOString(),
      read_at: null,
    };
    setMessages((curr) => [...curr, optimistic]);
    setBody("");

    const result = await sendMessage({
      driverId,
      riderId,
      body: text,
      senderRole: myRole,
    });
    setSending(false);

    if (result.error) {
      setError(result.error);
      setMessages((curr) => curr.filter((m) => m.id !== tempId));
      setBody(text);
      return;
    }

    // Replace optimistic placeholder with real id from server.
    if (result.id) {
      const realId = result.id;
      const createdAt = result.createdAt ?? optimistic.created_at;
      setMessages((curr) =>
        curr.map((m) => (m.id === tempId ? { ...m, id: realId, created_at: createdAt } : m))
      );
    }
  }

  // Compute day separators in a pure reduce so each row knows whether to
  // print a header. (Avoids reassigning a closure-local variable, which the
  // react-hooks/immutability rule flags during render.)
  const renderRows = messages.reduce<
    Array<{ m: MessageRow; day: string; showDay: boolean }>
  >((acc, m) => {
    const day = dayLabel(m.created_at);
    const prevDay = acc.length > 0 ? acc[acc.length - 1].day : null;
    acc.push({ m, day, showDay: day !== prevDay });
    return acc;
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-4 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-sm text-neutral-500 mt-8">
            No messages yet. Say hi to {otherName}.
          </p>
        )}
        {renderRows.map(({ m, day, showDay }) => {
          const mine = m.sender_role === myRole;
          return (
            <div key={m.id} className="space-y-2">
              {showDay && (
                <p className="text-center text-xs text-neutral-500 my-2">{day}</p>
              )}
              <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                    mine
                      ? "bg-white text-neutral-950"
                      : "bg-neutral-800 text-neutral-100"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p
                    className={`text-[10px] mt-1 ${
                      mine ? "text-neutral-500" : "text-neutral-400"
                    }`}
                  >
                    {timeLabel(m.created_at)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-neutral-800 px-4 py-3 pb-safe space-y-2">
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`Message ${otherName}…`}
            rows={1}
            className="input resize-none flex-1 max-h-32"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            type="submit"
            disabled={sending || !body.trim()}
            className="rounded-xl bg-white text-neutral-950 px-4 py-3 text-sm font-medium disabled:opacity-50 shrink-0"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
