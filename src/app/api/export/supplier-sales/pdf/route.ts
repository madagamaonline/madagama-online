import PDFDocument from "pdfkit";
import { getSession } from "@/lib/auth";
import { canAccessStaffFinance } from "@/lib/authorization";
import { getSettings } from "@/lib/settings";
import { getSupplierSalesReport } from "@/lib/supplier-sales";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const money = (value: number) => `LKR ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function collectPdf(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number, heading?: () => void) {
  if (doc.y + height <= doc.page.height - 35) return;
  doc.addPage();
  heading?.();
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!canAccessStaffFinance(session.role)) return new Response("Forbidden", { status: 403 });

  const [report, settings] = await Promise.all([
    getSupplierSalesReport(new URL(request.url).searchParams.get("month")),
    getSettings(),
  ]);
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 30, bufferPages: true, info: { Title: `Supplier sales - ${report.monthLabel}`, Author: settings?.businessName ?? "Madagama Pvt Ltd" } });
  const output = collectPdf(doc);
  const pageWidth = doc.page.width - 60;

  doc.font("Helvetica-Bold").fontSize(17).text(settings?.businessName ?? "Madagama Pvt Ltd");
  doc.font("Helvetica").fontSize(10).text(`Supplier-wise sales - ${report.monthLabel}`);
  doc.fillColor("#555555").fontSize(8).text(`Generated ${report.generatedAt.toLocaleString("en-GB", { timeZone: "Asia/Colombo" })} | Legacy inferred rows use the product's current primary supplier at migration time.`);
  doc.fillColor("#000000").moveDown(0.8);

  const supplierWidths = [155, 48, 75, 75, 75, 75, 75, 55];
  const supplierHeaders = ["Supplier", "Inv.", "Sales", "Returns", "Net sales", "Net COGS", "Gross profit", "Margin"];
  const supplierHeader = () => {
    const y = doc.y;
    let x = 30;
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#1f4d3a");
    supplierHeaders.forEach((value, index) => { doc.text(value, x, y, { width: supplierWidths[index], align: index === 0 ? "left" : "right" }); x += supplierWidths[index]; });
    doc.fillColor("#000000");
    doc.y = y + 15;
  };
  supplierHeader();
  for (const row of report.suppliers) {
    ensureSpace(doc, 15, supplierHeader);
    const y = doc.y;
    let x = 30;
    const label = `${row.supplierName}${row.inferredLineCount ? " *" : ""}`;
    const values = [label, String(row.invoiceCount), money(row.sales), money(row.returns), money(row.netSales), money(row.cogs), money(row.grossProfit), `${row.marginPct.toFixed(2)}%`];
    doc.font("Helvetica").fontSize(7.5);
    values.forEach((value, index) => { doc.text(value, x, y, { width: supplierWidths[index], align: index === 0 ? "left" : "right", ellipsis: true }); x += supplierWidths[index]; });
    doc.y = y + 14;
  }
  ensureSpace(doc, 18, supplierHeader);
  doc.font("Helvetica-Bold").fontSize(8).text(`TOTAL   Sales ${money(report.totals.sales)}   Returns ${money(report.totals.returns)}   Net ${money(report.totals.netSales)}   COGS ${money(report.totals.cogs)}   Gross profit ${money(report.totals.grossProfit)}`, 30, doc.y, { width: pageWidth });

  if (report.vehicleSuppliers.length) {
    doc.addPage();
    doc.font("Helvetica-Bold").fontSize(14).text("Consignment vehicle sales by supplier");
    doc.font("Helvetica").fontSize(8).text("Shown separately because business revenue is dealer commission, not the full customer price.").moveDown();
    for (const row of report.vehicleSuppliers) {
      ensureSpace(doc, 25);
      doc.font("Helvetica-Bold").fontSize(9).text(`${row.supplierName} - ${row.vehiclesSold} vehicle(s)`);
      doc.font("Helvetica").fontSize(8).text(`Customer price ${money(row.customerPrice)} | Supplier due ${money(row.supplierSettlementDue)} | Gross commission ${money(row.grossCommission)} | Discounts ${money(row.customerDiscount)} | Net commission ${money(row.netCommission)}`);
    }
  }

  doc.addPage();
  doc.font("Helvetica-Bold").fontSize(14).text("Product detail").moveDown(0.5);
  const detailWidths = [48, 67, 112, 58, 145, 55, 72, 72, 72];
  const detailHeaders = ["Date", "Invoice", "Supplier", "Type", "Product", "Qty", "Sales", "Returns", "COGS"];
  const detailHeader = () => {
    const y = doc.y;
    let x = 30;
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#1f4d3a");
    detailHeaders.forEach((value, index) => { doc.text(value, x, y, { width: detailWidths[index], align: index >= 5 ? "right" : "left" }); x += detailWidths[index]; });
    doc.fillColor("#000000");
    doc.y = y + 14;
  };
  detailHeader();
  for (const row of report.details) {
    ensureSpace(doc, 14, detailHeader);
    const y = doc.y;
    let x = 30;
    const values = [row.date.toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" }), row.invoiceNumber, row.supplierName, row.kind, `${row.productCode} ${row.productName}`.trim(), `${row.quantity} ${row.unit}`, money(row.sales), money(row.returns), money(row.cogs - row.returnedCogs)];
    doc.font("Helvetica").fontSize(6.8);
    values.forEach((value, index) => { doc.text(value, x, y, { width: detailWidths[index], align: index >= 5 ? "right" : "left", ellipsis: true }); x += detailWidths[index]; });
    doc.y = y + 13;
  }

  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(index);
    doc.font("Helvetica").fontSize(7).fillColor("#777777").text(`Page ${index + 1} of ${range.count}`, 30, doc.page.height - 25, { width: pageWidth, align: "right" });
  }
  doc.end();
  const buffer = await output;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="supplier-sales-${report.monthKey}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
