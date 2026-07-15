import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeader
        title="Credit Invoices"
        subtitle="Credit-sale documents and balances. Use Credit Accounts for collections, aging, and interest."
      />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="border-b border-border p-4">
            <div className="flex flex-wrap justify-between gap-3">
              <Skeleton className="h-11 w-full max-w-lg rounded-xl" />
              <Skeleton className="h-9 w-64 rounded-lg" />
            </div>
            <Skeleton className="mt-3 h-8 w-80 rounded-lg" />
          </div>
          <TableSkeleton rows={8} cols={8} />
        </CardContent>
      </Card>
    </div>
  );
}
