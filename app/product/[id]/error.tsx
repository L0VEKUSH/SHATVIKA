'use client';

import { useEffect } from 'react';
import Link from 'next/link';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ProductError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log error for monitoring
    console.error('Product page error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] px-4">
      <div className="max-w-md w-full">
        <div className="glass rounded-3xl p-8 border border-white/8 text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-black text-white mb-2">Product Not Found</h1>
          <p className="text-gray-400 mb-6">
            {error.message || 'This product could not be loaded. It may have been removed or is no longer available.'}
          </p>

          <div className="flex gap-3">
            <button
              onClick={reset}
              className="flex-1 py-2.5 rounded-xl bg-[#FF4500] text-white font-bold hover:bg-[#FF6500] transition-colors"
            >
              Try Again
            </button>
            <Link
              href="/"
              className="flex-1 py-2.5 rounded-xl bg-white/8 text-white font-bold hover:bg-white/12 transition-colors text-center"
            >
              Go Home
            </Link>
          </div>

          {process.env.NODE_ENV === 'development' && (
            <details className="mt-6 text-left">
              <summary className="text-xs text-gray-500 cursor-pointer">Error details (dev only)</summary>
              <pre className="mt-2 bg-white/5 p-3 rounded text-xs text-gray-400 overflow-auto max-h-40">
                {error.message}
                {error.stack}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
