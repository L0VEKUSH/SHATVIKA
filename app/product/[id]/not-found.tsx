import Link from 'next/link';

export default function ProductNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] px-4">
      <div className="max-w-md w-full">
        <div className="glass rounded-3xl p-8 border border-white/8 text-center">
          <div className="text-5xl mb-4">🔍</div>
          <h1 className="text-2xl font-black text-white mb-2">Product Not Found</h1>
          <p className="text-gray-400 mb-6">
            The product you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>

          <Link
            href="/"
            className="w-full py-2.5 rounded-xl bg-[#FF4500] text-white font-bold hover:bg-[#FF6500] transition-colors inline-block"
          >
            Browse Menu
          </Link>
        </div>
      </div>
    </div>
  );
}
