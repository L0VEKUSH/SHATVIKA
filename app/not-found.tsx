import Link from 'next/link';
import { Search } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-9xl font-black mb-6">
          🔍
        </div>
        <h1 className="text-4xl font-black text-white mb-2">Page Not Found</h1>
        <p className="text-gray-400 mb-8">
          The page you&apos;re looking for doesn&apos;t exist. It might have been moved or deleted.
        </p>

        
        <div className="space-y-3">
          <Link
            href="/"
            className="block w-full px-6 py-3 rounded-xl bg-gradient-to-r from-[#FF4500] to-[#FF8C00]
                       text-white font-bold hover:shadow-lg hover:shadow-[#FF4500]/30 transition-all"
          >
            Back to Home
          </Link>
          <Link
            href="/#menu"
            className="block w-full px-6 py-3 rounded-xl bg-white/10 text-white font-bold
                       hover:bg-white/20 transition-colors"
          >
            View Menu
          </Link>
        </div>
      </div>
    </div>
  );
}
