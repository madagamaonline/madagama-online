import { getSession } from "@/lib/auth";
import { getCurrentShiftSummary, getShiftReports } from "./actions";
import { ShiftReportForm } from "@/components/shift-report-form";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatLKR } from "@/lib/utils";
import { AlertCircle, TrendingDown, CheckCircle2, History } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ShiftReportPage() {
  const [summary, history, session] = await Promise.all([
    getCurrentShiftSummary(),
    getShiftReports(),
    getSession(),
  ]);
  const cashierName = session?.name ?? "—";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Shift & Cash Drawer"
        subtitle="Perform end-of-shift drawer count checks and reconcile actual vs expected cash."
      />

      <div className="space-y-6">
        {/* Active Reconciliation Form */}
        <ShiftReportForm summary={summary} cashierName={cashierName} />

        {/* History Table */}
        <Card className="mt-8">
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <History className="h-4.5 w-4.5 text-muted" />
            <CardTitle className="text-sm font-bold">Shift Report History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {history.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-muted">
                No shift reports submitted yet.
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Shift Timeframe</TH>
                    <TH>Operator</TH>
                    <TH className="text-right">Expected</TH>
                    <TH className="text-right">Actual</TH>
                    <TH className="text-right">Discrepancy</TH>
                    <TH>Notes</TH>
                  </TR>
                </THead>
                <TBody>
                  {history.map((r) => {
                    const disc = r.discrepancy;
                    return (
                      <TR key={r.id}>
                        <TD className="text-xs">
                          <span className="font-semibold block text-foreground">
                            {new Date(r.endTime).toLocaleDateString()}
                          </span>
                          <span className="text-faint text-[10px]">
                            {new Date(r.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {" → "}
                            {new Date(r.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </TD>
                        <TD className="font-semibold text-xs text-foreground">
                          {r.operatorName}
                        </TD>
                        <TD className="text-right text-xs text-muted">
                          {formatLKR(r.expectedCash)}
                        </TD>
                        <TD className="text-right text-xs font-semibold text-foreground">
                          {formatLKR(r.actualCash)}
                        </TD>
                        <TD className="text-right text-xs">
                          {disc === 0 ? (
                            <span className="inline-flex items-center gap-1 font-bold text-emerald-600">
                              <CheckCircle2 className="h-3 w-3" /> Balanced
                            </span>
                          ) : disc < 0 ? (
                            <span className="inline-flex items-center gap-1 font-bold text-danger">
                              <AlertCircle className="h-3 w-3" /> {formatLKR(disc)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-bold text-blue-600">
                              <TrendingDown className="h-3 w-3 rotate-180" /> +{formatLKR(disc)}
                            </span>
                          )}
                        </TD>
                        <TD className="text-xs text-muted max-w-[200px] truncate" title={r.notes || ""}>
                          {r.notes || "—"}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
