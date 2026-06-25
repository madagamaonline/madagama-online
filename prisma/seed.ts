import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { nextProductCode } from "../src/lib/product-code";

const prisma = new PrismaClient();

async function main() {
  // --- Global settings (single row, id = 1) ---
  await prisma.setting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      businessName: "Madagama Pvt Ltd",
      address: "Sri Lanka",
      phone: "",
      interestRatePerMonth: "0.02",
      interestFreeMonths: 4,
      smsSenderId: "Madagama",
    },
  });

  // --- Admin user ---
  const email = "admin@madagama.lk";
  const passwordHash = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { name: "Administrator", email, passwordHash, role: "ADMIN" },
  });

  // --- Categories & subcategories ---
  const agri = await prisma.category.upsert({
    where: { code: "AGR" },
    update: {},
    create: { name: "Agricultural", code: "AGR", description: "Agricultural tools & spares" },
  });
  const elec = await prisma.category.upsert({
    where: { code: "ELC" },
    update: {},
    create: { name: "Electronics", code: "ELC", description: "Electronic items & parts" },
  });

  const subs: { categoryId: string; name: string; code: string }[] = [
    { categoryId: agri.id, name: "Tools", code: "TOOL" },
    { categoryId: agri.id, name: "Spare Parts", code: "SPRT" },
    { categoryId: elec.id, name: "Televisions", code: "TV" },
    { categoryId: elec.id, name: "Parts", code: "PART" },
  ];
  for (const s of subs) {
    await prisma.subcategory.upsert({
      where: { categoryId_code: { categoryId: s.categoryId, code: s.code } },
      update: {},
      create: s,
    });
  }

  // --- Sample employee & supplier (handy for testing) ---
  const empCount = await prisma.employee.count();
  if (empCount === 0) {
    await prisma.employee.create({
      data: { name: "Sunil Perera", phone: "0771234567", dailyRate: "2500" },
    });
  }
  const supCount = await prisma.supplier.count();
  if (supCount === 0) {
    await prisma.supplier.create({
      data: { name: "Lanka Distributors", contactPerson: "Nimal", phone: "0112345678" },
    });
  }

  // --- Sample products (handy for testing) ---
  const productCount = await prisma.product.count();
  if (productCount === 0) {
    const subByCode = async (code: string) =>
      prisma.subcategory.findFirstOrThrow({ where: { code }, include: { category: true } });
    const samples: { subCode: string; name: string; cost: number; price: number; qty: number; taxable: boolean }[] = [
      { subCode: "TOOL", name: "Garden Mamoty (Hoe)", cost: 1200, price: 1800, qty: 50, taxable: true },
      { subCode: "TOOL", name: "Pruning Shears", cost: 900, price: 1500, qty: 30, taxable: true },
      { subCode: "SPRT", name: "Water Pump Impeller", cost: 2500, price: 3800, qty: 15, taxable: false },
      { subCode: "TV", name: 'Samsung 43" Smart TV', cost: 95000, price: 125000, qty: 8, taxable: true },
      { subCode: "PART", name: "TV Remote (Universal)", cost: 600, price: 1200, qty: 40, taxable: false },
    ];
    for (const s of samples) {
      const sub = await subByCode(s.subCode);
      await prisma.$transaction(
        async (tx) => {
          const code = await nextProductCode(tx, sub.id);
          await tx.product.create({
            data: {
              code,
              name: s.name,
              categoryId: sub.categoryId,
              subcategoryId: sub.id,
              costPrice: s.cost,
              sellingPrice: s.price,
              quantityInStock: s.qty,
              reorderLevel: 5,
              taxable: s.taxable,
            },
          });
        },
        { timeout: 20000 },
      );
    }
  }

  console.log("Seed complete. Login: admin@madagama.lk / admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
