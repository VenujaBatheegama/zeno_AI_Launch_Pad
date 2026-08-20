export default function HomeLoading() {
  return (
    <div className="mx-auto max-w-5xl py-2 px-2 sm:px-4 space-y-8 animate-pulse">
      {/* Top Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-4 w-28 rounded bg-gray-200" />
        <div className="h-7 w-24 rounded-full bg-gray-200" />
      </div>

      {/* Hero Center skeleton */}
      <div className="mx-auto max-w-2xl text-center space-y-5 pt-4 flex flex-col items-center">
        <div className="size-24 rounded-full bg-sky-100" />
        <div className="space-y-2 flex flex-col items-center">
          <div className="h-6 w-36 rounded bg-gray-200" />
          <div className="h-9 w-96 rounded-lg bg-gray-200" />
          <div className="h-4 w-80 rounded bg-gray-100" />
        </div>

        {/* Input box skeleton */}
        <div className="w-full h-32 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" />
      </div>

      {/* Bottom cards skeleton */}
      <div className="grid gap-4 sm:grid-cols-3 pt-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-28 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="flex justify-between">
              <div className="size-5 rounded bg-gray-200" />
              <div className="h-4 w-16 rounded bg-gray-100" />
            </div>
            <div className="mt-4 h-4 w-1/2 rounded bg-gray-200" />
            <div className="mt-2 h-3 w-3/4 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
