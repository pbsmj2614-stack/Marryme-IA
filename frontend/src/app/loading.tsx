export default function Loading() {
  return (
    <div className="min-h-screen">
      {/* Header skeleton */}
      <div className="border-b border-border bg-white px-4 py-3 animate-pulse">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="h-6 bg-gray-100 rounded w-32" />
          <div className="flex gap-2">
            <div className="h-8 bg-gray-100 rounded-full w-20" />
            <div className="h-8 bg-gray-100 rounded-full w-8" />
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Title skeleton */}
        <div className="flex items-center justify-between mb-6 animate-pulse">
          <div className="h-7 bg-gray-100 rounded w-32" />
          <div className="flex gap-2">
            <div className="h-9 bg-gray-100 rounded-lg w-48" />
            <div className="h-9 bg-gray-100 rounded-lg w-36" />
            <div className="h-9 bg-gray-100 rounded-lg w-36" />
          </div>
        </div>

        {/* Panel skeleton */}
        <div className="mb-6 bg-white border border-border rounded-xl p-4 animate-pulse">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-4 bg-gray-100 rounded w-48" />
            <div className="h-5 bg-red-100 rounded-full w-24" />
            <div className="h-5 bg-amber-100 rounded-full w-28" />
            <div className="h-5 bg-green-100 rounded-full w-24" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="h-48 bg-gray-50 rounded-xl border border-red-100" />
            <div className="h-48 bg-gray-50 rounded-xl border border-green-100" />
          </div>
        </div>

        {/* Tabs skeleton */}
        <div className="flex gap-1 border-b border-gray-200 mb-6 animate-pulse">
          {[80, 72, 80, 96].map((w, i) => (
            <div key={i} className={`h-10 bg-gray-100 rounded-t mx-1`} style={{ width: w }} />
          ))}
        </div>

        {/* Cards grid skeleton */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse space-y-3"
            >
              <div className="flex justify-between">
                <div className="h-5 bg-gray-100 rounded w-40" />
                <div className="h-5 bg-gray-100 rounded w-20" />
              </div>
              <div className="flex gap-2">
                <div className="h-5 bg-brand-50 rounded-full w-16" />
                <div className="h-5 bg-pink-50 rounded-full w-20" />
              </div>
              <div className="h-4 bg-gray-100 rounded w-28" />
              <div className="space-y-2">
                <div className="h-4 bg-gray-100 rounded w-32" />
                <div className="h-4 bg-gray-100 rounded w-24" />
              </div>
              <div className="border-t border-gray-100 pt-3 flex justify-between">
                <div className="h-4 bg-gray-100 rounded w-20" />
                <div className="h-5 bg-green-50 rounded-full w-28" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
