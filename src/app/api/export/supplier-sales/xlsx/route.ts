import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { canAccessStaffFinance } from "@/lib/authorization";
import { getSupplierSalesReport } from "@/lib/supplier-sales";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MONEY_FORMAT = '"LKR" #,##0.00;[Red]-"LKR" #,##0.00';

function styleSheet(sheet: ExcelJS.Worksheet, moneyColumns: number[]) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4D3A" } };
  header.alignment = { vertical: "middle" };
  header.height = 22;
  moneyColumns.forEach((column) => { sheet.getColumn(column).numFmt = MONEY_FORMAT; });
  sheet.columns.forEach((column) => {
    let width = 12;
    column.eachCell?.({ includeEmpty: true }, (cell) => { width = Math.max(width, String(cell.value ?? "").length + 2); });
    column.width = Math.min(width, 38);
  });
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!canAccessStaffFinance(session.role)) return new Response("Forbidden", { status: 403 });

  const params = new URL(request.url).searchParams;
  const activity = params.get("activity");
  const report = await getSupplierSalesReport(params.get("month"), {
    from: params.get("from"), to: params.get("to"), supplier: params.get("supplier"), product: params.get("product"),
    activity: activity === "sales" || activity === "returns" ? activity : "all",
  });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Madagama";
  workbook.created = report.generatedAt;

  const summary = workbook.addWorksheet("Supplier Summary");
  summary.addRow(["Supplier", "Invoices", "Products", "Sales", "Returns", "Net sales", "Net COGS", "Gross profit", "Margin %", "Legacy inferred lines", "Unassigned lines"]);
  for (const row of report.suppliers) summary.addRow([row.supplierName, row.invoiceCount, row.productCount, row.sales, row.returns, row.netSales, row.cogs, row.grossProfit, row.marginPct / 100, row.inferredLineCount, row.unassignedLineCount]);
  const totalRow = summary.addRow(["TOTAL", report.totals.invoiceCount, report.totals.productCount, report.totals.sales, report.totals.returns, report.totals.netSales, report.totals.cogs, report.totals.grossProfit, report.totals.marginPct / 100, report.totals.inferredLineCount, report.totals.unassignedLineCount]);
  totalRow.font = { bold: true };
  summary.getColumn(9).numFmt = "0.00%";
  styleSheet(summary, [4, 5, 6, 7, 8]);

  const detail = workbook.addWorksheet("Product Detail");
  detail.addRow(["Type", "Date", "Invoice", "Supplier", "Attribution", "Product code", "Product", "Quantity", "Unit", "Sales", "Returns", "COGS", "Returned COGS", "Net sales", "Net COGS", "Gross profit"]);
  for (const row of report.details) {
    const netSales = row.sales - row.returns;
    const netCogs = row.cogs - row.returnedCogs;
    detail.addRow([row.kind, row.date, row.invoiceNumber, row.supplierName, row.attribution ?? "UNASSIGNED", row.productCode, row.productName, row.quantity, row.unit, row.sales, row.returns, row.cogs, row.returnedCogs, netSales, netCogs, netSales - netCogs]);
  }
  detail.getColumn(2).numFmt = "yyyy-mm-dd hh:mm";
  styleSheet(detail, [10, 11, 12, 13, 14, 15, 16]);

  const vehicles = workbook.addWorksheet("Consignment Vehicles");
  vehicles.addRow(["Supplier", "Vehicles sold", "Customer price", "Supplier settlement due", "Gross commission", "Customer discounts", "Net commission", "Customer collected"]);
  for (const row of report.vehicleSuppliers) vehicles.addRow([row.supplierName, row.vehiclesSold, row.customerPrice, row.supplierSettlementDue, row.grossCommission, row.customerDiscount, row.netCommission, row.customerCollected]);
  styleSheet(vehicles, [3, 4, 5, 6, 7, 8]);

  const reconciliation = workbook.addWorksheet("Reconciliation");
  reconciliation.addRow(["Check", "Value"]);
  reconciliation.addRow(["Reporting month", report.monthLabel]);
  reconciliation.addRow(["Merchandise sales", report.totals.sales]);
  reconciliation.addRow(["Customer returns", report.totals.returns]);
  reconciliation.addRow(["Net merchandise sales", report.totals.netSales]);
  reconciliation.addRow(["Net COGS", report.totals.cogs]);
  reconciliation.addRow(["Gross profit", report.totals.grossProfit]);
  reconciliation.addRow(["Legacy inferred lines", report.totals.inferredLineCount]);
  reconciliation.addRow(["Unassigned lines", report.totals.unassignedLineCount]);
  styleSheet(reconciliation, [2]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="supplier-sales-${report.monthLabel.replaceAll(" ", "-")}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
