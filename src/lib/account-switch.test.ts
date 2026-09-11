import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), findUser: vi.fn(), updateMany: vi.fn(), getSession: vi.fn(), setSession: vi.fn(), verifyPassword: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { $transaction: mocks.transaction, user: { findUnique: mocks.findUser }, authAttemptWindow: { updateMany: mocks.updateMany } } }));
vi.mock("./auth", () => ({ getSession: mocks.getSession, setSession: mocks.setSession, verifyPassword: mocks.verifyPassword }));
import { switchUser } from "@/app/(app)/account-actions";
import { reserveSwitchAttempt, releaseSuccessfulSwitchAttempt } from "./auth-attempts";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ id: "staff", role: "STAFF" });
  mocks.findUser.mockResolvedValue({ id: "admin", name: "Admin", email: "admin@example.test", role: "ADMIN", active: true, pin: "1234", passwordHash: "stored-hash" });
  mocks.verifyPassword.mockResolvedValue(false);
});
function windowFixture(attempts: number, expiresAt = new Date(Date.now() + 900000)) {
  const row = { key: "switch:admin", attempts, expiresAt };
  const delegate = {
    findUnique: vi.fn().mockImplementation(async () => ({ ...row })),
    update: vi.fn().mockImplementation(async () => { row.attempts++; }),
    upsert: vi.fn().mockImplementation(async ({ update }) => Object.assign(row, update)),
  };
  mocks.transaction.mockImplementation(async (work) => work({ authAttemptWindow: delegate }));
  return { row, delegate };
}
describe("shared switch attempt limits", () => {
  it("refuses the sixth attempt across calls", async () => {
    const { row } = windowFixture(0);
    for (let i = 0; i < 5; i++) expect(await reserveSwitchAttempt("admin")).not.toBeNull();
    expect(await reserveSwitchAttempt("admin")).toBeNull();
    expect(row.attempts).toBe(5);
    expect(mocks.transaction.mock.calls[0][1].isolationLevel).toBe("Serializable");
  });
  it("starts a fresh window after expiry", async () => {
    const { row } = windowFixture(5, new Date(0));
    expect(await reserveSwitchAttempt("admin")).not.toBeNull();
    expect(row.attempts).toBe(1);
  });
  it("releases only the successful reservation in its own window", async () => {
    const ticket = { key: "switch:admin", expiresAt: new Date() };
    await releaseSuccessfulSwitchAttempt(ticket);
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { ...ticket, attempts: { gt: 0 } }, data: { attempts: { decrement: 1 } } });
  });
});
describe("switch authorization", () => {
  it("never accepts an admin PIN as a password", async () => {
    windowFixture(0);
    expect(await switchUser("admin", "1234")).toEqual({ ok: false, error: "Incorrect password." });
    expect(mocks.verifyPassword).toHaveBeenCalledWith("1234", "stored-hash");
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
  it("allows an administrator with a verified full password", async () => {
    windowFixture(0); mocks.verifyPassword.mockResolvedValue(true);
    expect(await switchUser("admin", "valid-password")).toEqual({ ok: true });
    expect(mocks.setSession).toHaveBeenCalledWith(expect.objectContaining({ role: "ADMIN" }));
    expect(mocks.updateMany).toHaveBeenCalledOnce();
  });
  it("checks throttling before credentials and fails closed if storage is unavailable", async () => {
    windowFixture(5);
    expect(await switchUser("admin", "1234")).toMatchObject({ ok: false });
    expect(mocks.findUser).not.toHaveBeenCalled();
    mocks.transaction.mockRejectedValue(new Error("offline"));
    expect(await switchUser("admin", "password")).toMatchObject({ ok: false });
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
  it("requires an existing session", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect(await switchUser("admin", "password")).toMatchObject({ ok: false });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
