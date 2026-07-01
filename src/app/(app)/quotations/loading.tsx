import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeader title="Quotations" subtitle="Price quotes for customers" />
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <Skeleton className="h-11 w-full max-w-md rounded-xl" />
            <Skeleton className="h-9 w-64 rounded-lg" />
          </div>
          <TableSkeleton rows={8} cols={5} />
        </CardContent>
      </Card>
    </div>
  );
}
