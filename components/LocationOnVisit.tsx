'use client';

import { useState } from 'react';
import { MapPin, X } from 'lucide-react';

type LocationStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable' | 'error';

export default function LocationOnVisit() {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [dismissed, setDismissed] = useState(false);

  const requestLocation = () => {
    const geo = navigator.geolocation;
    if (!geo) {
      setStatus('unavailable');
      return;
    }

    setStatus('requesting');

    geo.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        try {
          localStorage.setItem(
            'shatvika:lastLocation',
            JSON.stringify({
              latitude,
              longitude,
              accuracy: accuracy ?? null,
              timestamp: pos.timestamp,
            }),
          );
          localStorage.setItem('shatvika:lastLocationTs', String(Date.now()));
        } catch {
          // ignore storage errors
        }
        setStatus('granted');
      },
      (err) => {
        if (err?.code === 1) setStatus('denied');
        else setStatus('error');
      },
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 300_000,
      },
    );
  };

  if (dismissed || status === 'granted') return null;

  const message =
    status === 'denied'
      ? 'Location permission denied. Delivery estimates use default timing.'
      : status === 'unavailable'
        ? 'Location is unavailable on this device.'
        : status === 'error'
          ? 'Could not get location. Try again later.'
          : 'Share your location for more accurate delivery estimates.';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 sm:right-auto sm:max-w-sm z-40
                 rounded-2xl border border-white/10 bg-[#111]/95 backdrop-blur-xl
                 p-4 shadow-2xl"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#FF4500]/15 flex items-center justify-center shrink-0">
          <MapPin className="w-4 h-4 text-[#FF8C00]" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white font-semibold">Personalize delivery</p>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">{message}</p>
          {status === 'idle' || status === 'requesting' ? (
            <button
              type="button"
              onClick={requestLocation}
              disabled={status === 'requesting'}
              className="mt-3 btn-flame px-4 py-2 text-xs font-bold disabled:opacity-60"
            >
              {status === 'requesting' ? 'Requesting…' : 'Allow location'}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss location prompt"
          className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center shrink-0"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
    </div>
  );
}
