import { describe, expect, it, vi } from "vitest";
import { generateInvoiceNumber } from "./invoice-number";

function transaction(values: bigint[], existing: Array<{ id: string } | null> = []) {
  return {
    $queryRaw: vi.fn().mockImplementation(async () => [{ value: values.shift() }]),
    invoice: {
      findUnique: vi.fn().mockImplementation(async () => existing.shift() ?? null),
    },
  };
}

describe("generateInvoiceNumber", () => {
  it("uses the private taxable series digit", async () => {
    const tx = transaction([BigInt(153)]);
    await expect(generateInvoiceNumber(tx as never, "TAXABLE")).resolves.toBe("0001532");
  });

  it("uses the private non-taxable series digit", async () => {
    const tx = transaction([BigInt(154)]);
    await expect(generateInvoiceNumber(tx as never, "NON_TAXABLE")).resolves.toBe("0001547");
  });

  it("skips a numeric reference that already exists", async () => {
    const tx = transaction([BigInt(1), BigInt(2)], [{ id: "legacy" }, null]);
    await expect(generateInvoiceNumber(tx as never, "TAXABLE")).resolves.toBe("0000022");
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
