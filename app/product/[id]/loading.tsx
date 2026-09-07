export default function ProductLoading() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] pt-20">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Image skeleton */}
          <div className="aspect-square rounded-3xl bg-white/5 border border-white/8 animate-pulse" />

          {/* Content skeleton */}
          <div className="space-y-6 pt-4">
            <div className="space-y-2">
              <div className="h-8 bg-white/10 rounded w-48 animate-pulse" />
              <div className="h-4 bg-white/10 rounded w-32 animate-pulse" />
            </div>

            <div className="space-y-2">
              <div className="h-4 bg-white/10 rounded w-full animate-pulse" />
              <div className="h-4 bg-white/10 rounded w-5/6 animate-pulse" />
              <div className="h-4 bg-white/10 rounded w-4/6 animate-pulse" />
            </div>

            <div className="h-12 bg-white/10 rounded-xl animate-pulse" />

            <div className="flex gap-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 bg-white/10 rounded-lg animate-pulse flex-1" />
              ))}
            </div>

            <div className="pt-4 space-y-3">
              <div className="h-10 bg-white/10 rounded-xl animate-pulse" />
              <div className="h-10 bg-white/10 rounded-xl animate-pulse" />
            </div>
          </div>
        </div>

        {/* Related products skeleton */}
        <div className="mt-20">
          <div className="h-8 bg-white/10 rounded w-48 animate-pulse mb-8" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="aspect-square rounded-2xl bg-white/5 border border-white/8 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
