-- Preserve the product model number as it appeared when the invoice was issued.
ALTER TABLE "InvoiceItem" ADD COLUMN "modelNumberSnapshot" TEXT;
