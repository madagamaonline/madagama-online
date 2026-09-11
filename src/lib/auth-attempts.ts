import "server-only";
import { prisma } from "./prisma";
import { serializableTransaction } from "./serializable-transaction";

const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;

/** Reserve an attempt before checking credentials. The target account is the
 * bucket, so changing sessions or application instances cannot bypass the limit.
 * Successful reservations are released without erasing concurrent failures.
 */
export async function reserveSwitchAttempt(userId: string, now = new Date()): Promise<{ key: string; expiresAt: Date } | null> {
  return serializableTransaction(async (tx) => {
    const key = `switch:${userId}`;
    const current = await tx.authAttemptWindow.findUnique({ where: { key } });
    if (current && current.expiresAt > now) {
      if (current.attempts >= MAX_ATTEMPTS) return null;
      await tx.authAttemptWindow.update({ where: { key }, data: { attempts: { increment: 1 } } });
    } else {
      const data = { attempts: 1, expiresAt: new Date(now.getTime() + WINDOW_MS) };
      await tx.authAttemptWindow.upsert({ where: { key }, create: { key, ...data }, update: data });
    }
    return { key, expiresAt: current && current.expiresAt > now ? current.expiresAt : new Date(now.getTime() + WINDOW_MS) };
  });
}

export async function releaseSuccessfulSwitchAttempt(ticket: { key: string; expiresAt: Date }): Promise<void> {
  await prisma.authAttemptWindow.updateMany({
    where: { key: ticket.key, expiresAt: ticket.expiresAt, attempts: { gt: 0 } },
    data: { attempts: { decrement: 1 } },
  });
}
