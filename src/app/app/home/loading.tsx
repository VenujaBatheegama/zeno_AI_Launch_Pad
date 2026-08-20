export default function HomeLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-pulse">
      <div className="min-h-[calc(100vh-5rem)] rounded-[32px] border border-white/10 bg-[#161223]/90 p-8 shadow-2xl backdrop-blur-2xl flex flex-col justify-between">
        {/* Top bar skeleton */}
        <div className="flex items-center justify-between border-b border-white/10 pb-5">
          <div className="h-8 w-52 rounded-full bg-white/10" />
          <div className="flex gap-2">
            <div className="h-8 w-28 rounded-full bg-white/10" />
            <div className="h-8 w-28 rounded-full bg-white/10" />
          </div>
        </div>

        {/* Center hero skeleton */}
        <div className="mx-auto max-w-2xl py-10 text-center space-y-6 flex flex-col items-center">
          <div className="size-28 rounded-full bg-purple-500/20 blur-md" />
          <div className="h-10 w-96 rounded-2xl bg-white/10" />
          <div className="flex gap-2 justify-center">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-7 w-28 rounded-full bg-white/5" />
            ))}
          </div>
          <div className="w-full h-32 rounded-2xl border border-purple-500/20 bg-[#1d162d]/80" />
        </div>

        {/* Bottom cards skeleton */}
        <div className="grid gap-4 sm:grid-cols-3 pt-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 rounded-2xl border border-white/10 bg-[#1b1528]/70 p-5"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
