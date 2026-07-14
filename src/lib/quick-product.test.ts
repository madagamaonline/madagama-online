import { describe, expect, it } from "vitest";
import { validateQuickProduct } from "./quick-product";

const valid = {
  name: "  New Television  ",
  categoryId: "category-1",
  sellingPrice: 125000,
  taxable: false,
};

describe("validateQuickProduct", () => {
  it("accepts the minimum quick-create fields and trims the product name", () => {
    const result = validateQuickProduct(valid);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("New Television");
  });

  it("rejects an empty product name", () => {
    const result = validateQuickProduct({ ...valid, name: "   " });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("Product name is required");
  });

  it("rejects a negative selling price", () => {
    const result = validateQuickProduct({ ...valid, sellingPrice: -1 });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("Selling price cannot be negative");
  });
});
