import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";

/** Shared streamed fallback. Nested routes can keep their more specific skeletons. */
export default function AppLoading() {
  return (
    <div className="animate-fade-in space-y-5" role="status" aria-label="Loading page">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72 max-w-[70vw]" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex items-center justify-between gap-4 border-b border-border-subtle p-4">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-9 w-56 max-w-[45vw]" />
        </div>
        <TableSkeleton rows={7} cols={5} />
      </div>
      <span className="sr-only">Loading content…</span>
    </div>
  );
}
