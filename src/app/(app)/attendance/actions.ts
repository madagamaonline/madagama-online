"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export type SaveAttendanceResult = { ok: boolean; error?: string };

const schema = z.object({
  date: z.string().min(1),
  entries: z.array(
    z.object({
      employeeId: z.string().min(1),
      status: z.enum(["PRESENT", "ABSENT", "HALF_DAY"]),
    }),
  ),
});

export async function saveAttendance(input: z.input<typeof schema>): Promise<SaveAttendanceResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid attendance data" };
  const date = new Date(parsed.data.date + "T00:00:00.000Z");

  await prisma.$transaction(
    parsed.data.entries.map((e) =>
      prisma.attendance.upsert({
        where: { employeeId_date: { employeeId: e.employeeId, date } },
        update: { status: e.status },
        create: { employeeId: e.employeeId, date, status: e.status },
      }),
    ),
  );

  revalidatePath("/attendance");
  return { ok: true };
}
