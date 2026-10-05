'use client';

import { useState } from 'react';
import { MapPin, X } from 'lucide-react';

/**
 * Kept under its historical component name to avoid a broad page rewrite.
 * The old implementation requested precise geolocation for delivery estimates,
 * even though this release supports counter collection only.
 */
export default function LocationOnVisit() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 z-40 rounded-2xl border border-white/10 bg-[#111]/95 p-4 shadow-2xl backdrop-blur-xl sm:right-auto sm:max-w-sm"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FF4500]/15">
          <MapPin className="h-4 w-4 text-[#FF8C00]" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Counter collection only</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-400">
            Delivery is currently unavailable. Confirm your order to receive one token, pay at the counter, and collect your items.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss collection notice"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 hover:bg-white/10"
        >
          <X className="h-4 w-4 text-gray-400" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
