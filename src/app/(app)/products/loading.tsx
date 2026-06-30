import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeader title="Products" subtitle="Stock items with auto-generated codes" />
      <Card>
        <CardContent className="p-0">
          <div className="border-b border-border p-4">
            <Skeleton className="h-11 max-w-md rounded-xl" />
          </div>
          <TableSkeleton rows={9} cols={8} />
        </CardContent>
      </Card>
    </div>
  );
}
