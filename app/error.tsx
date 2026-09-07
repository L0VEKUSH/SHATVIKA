'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6">
          <AlertCircle className="w-16 h-16 text-red-500" />
        </div>
        <h1 className="text-3xl font-black text-white mb-3">Oops! Something went wrong</h1>
        <p className="text-gray-400 mb-2">{error.message || 'An unexpected error occurred'}</p>
        {error.digest && <p className="text-gray-600 text-xs mb-6">Error ID: {error.digest}</p>}
        
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-[#FF4500] to-[#FF8C00]
                       text-white font-bold hover:shadow-lg hover:shadow-[#FF4500]/30 transition-all"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="flex-1 px-6 py-3 rounded-xl bg-white/10 text-white font-bold
                       hover:bg-white/20 transition-colors"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
