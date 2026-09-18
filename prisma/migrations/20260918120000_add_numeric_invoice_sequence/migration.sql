-- Additive only: allocates references for new invoices. Existing Invoice rows,
-- invoice numbers, tax categories and financial records remain untouched.
CREATE SEQUENCE IF NOT EXISTS "invoice_public_sequence"
AS BIGINT
START WITH 1
INCREMENT BY 1
NO MINVALUE
NO MAXVALUE
CACHE 1;
