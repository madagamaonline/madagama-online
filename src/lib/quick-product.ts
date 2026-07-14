import { z } from "zod";

export const quickProductSchema = z.object({
  name: z.string().trim().min(1, "Product name is required"),
  categoryId: z.string().min(1, "Category is required"),
  subcategoryId: z.string().optional(),
  sellingPrice: z.coerce.number().finite().min(0, "Selling price cannot be negative"),
  taxable: z.boolean(),
  modelNumber: z.string().optional(),
  barcode: z.string().optional(),
  primarySupplierId: z.string().optional(),
});

export function validateQuickProduct(input: unknown) {
  return quickProductSchema.safeParse(input);
}
