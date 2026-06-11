"use client";

import { useEffect, useRef, useState } from "react";
import type { SuggestItem } from "@/app/api/geocode/route";

interface Props {
  label: string;
  placeholder?: string;
  value: string;
  // Whether the current text corresponds to a confirmed (coordinate-backed)
  // selection. Drives the ✓ and lets the parent require a real pick.
  selected: boolean;
  // Raw text edits — the parent should clear any stored coordinates so a
  // half-typed address can't be submitted as if verified.
  onTextChange: (text: string) => void;
  onSelect: (s: { name: string; lat: number; lng: number }) => void;
  proximity?: { lat: number; lng: number } | null;
}

export function AddressAutocomplete({
  label,
  placeholder,
  value,
  selected,
  onTextChange,
  onSelect,
  proximity,
}: Props) {
  const [suggestions, setSuggestions] = useState<SuggestItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Mapbox Search Box billing groups suggest+retrieve calls by session token.
  // New token after each completed selection.
  const sessionRef = useRef<string>(crypto.randomUUID());
  // Set right after a pick so the resulting text change doesn't re-query.
  const skipNextQuery = useRef(false);

  useEffect(() => {
    if (skipNextQuery.current) {
      skipNextQuery.current = false;
      return;
    }
    const q = value.trim();
    const controller = new AbortController();

    // All state changes happen inside this async callback (never synchronously
    // in the effect body) to satisfy react-hooks/set-state-in-effect.
    const timer = setTimeout(async () => {
      if (selected || q.length < 3) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams({ q, session: sessionRef.current });
        if (proximity) params.set("proximity", `${proximity.lng},${proximity.lat}`);
        const res = await fetch(`/api/geocode?${params}`, { signal: controller.signal });
        const data = (await res.json()) as { suggestions: SuggestItem[] };
        setSuggestions(data.suggestions);
        setOpen(data.suggestions.length > 0);
      } catch {
        // aborted or network error — ignore
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [value, selected, proximity]);

  async function pick(item: SuggestItem) {
    skipNextQuery.current = true;
    setOpen(false);
    setLoading(true);
    // Show the chosen label immediately while we fetch coordinates.
    const label = item.place_formatted
      ? `${item.name}, ${item.place_formatted}`
      : item.name;
    onTextChange(label);
    try {
      const params = new URLSearchParams({
        id: item.mapbox_id,
        session: sessionRef.current,
      });
      const res = await fetch(`/api/geocode/retrieve?${params}`);
      const data = (await res.json()) as { lat?: number; lng?: number; error?: string };
      if (data.lat != null && data.lng != null) {
        onSelect({ name: label, lat: data.lat, lng: data.lng });
      }
    } catch {
      // leave unselected — parent keeps coords null, submit stays disabled
    } finally {
      setSuggestions([]);
      setLoading(false);
      // Fresh session for the next search.
      sessionRef.current = crypto.randomUUID();
    }
  }

  return (
    <div className="space-y-1 relative">
      <label className="text-xs text-neutral-400">{label}</label>
      <div className="relative">
        <input
          className="input pr-7"
          value={value}
          onChange={(e) => onTextChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
        />
        {selected && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-400 text-sm">
            ✓
          </span>
        )}
      </div>

      {open && (
        <ul className="absolute z-30 left-0 right-0 mt-1 rounded-xl bg-neutral-900 border border-neutral-700 overflow-hidden shadow-xl">
          {suggestions.map((s) => (
            <li key={s.mapbox_id}>
              <button
                type="button"
                onClick={() => pick(s)}
                className="w-full text-left px-3 py-2 hover:bg-neutral-800 border-b border-neutral-800 last:border-0"
              >
                <span className="block text-sm text-neutral-100">{s.name}</span>
                {s.place_formatted && (
                  <span className="block text-xs text-neutral-500 truncate">
                    {s.place_formatted}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {loading && !open && <p className="text-xs text-neutral-500">Searching…</p>}
    </div>
  );
}
