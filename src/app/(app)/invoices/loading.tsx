import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeader title="Invoices" subtitle="All sales" />
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <Skeleton className="h-11 w-full max-w-md rounded-xl" />
            <Skeleton className="h-9 w-40 rounded-lg" />
          </div>
          <TableSkeleton rows={9} cols={7} />
        </CardContent>
      </Card>
    </div>
  );
}
