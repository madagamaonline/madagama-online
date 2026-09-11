import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), update: vi.fn() }));
vi.mock("./auth", () => ({ requireActionStaffFinanceAccess: mocks.auth, getSession: mocks.auth }));
vi.mock("./prisma", () => ({ prisma: { setting: { findUnique: mocks.find, update: mocks.update }, user: { findMany: vi.fn().mockResolvedValue([]) } } }));
vi.mock("./backups", () => ({ backupsConfigured: () => false, restoreConfigured: () => false, restoreRunsUrl: () => null, backupRunsUrl: () => null }));
vi.mock("@/components/users-manager", () => ({ UsersManager: () => null }));
vi.mock("@/components/system-reset", () => ({ SystemReset: () => null }));
vi.mock("@/components/system-restore", () => ({ SystemRestore: () => null }));
vi.mock("@/components/system-backup", () => ({ SystemBackup: () => null }));
import SettingsPage from "@/app/(app)/settings/page";
import { updateSettings } from "@/app/(app)/settings/actions";
import { SettingsForm } from "@/components/settings-form";

beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ id: "user", role: "ADMIN" }); mocks.find.mockResolvedValue({ textlkApiToken: "never-send-this-secret", nonTaxableEnabled: true }); });
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ businessName: "Mock", interestRatePct: "2", interestFreeMonths: "4", reminderDayOfMonth: "1", textlkApiToken: "", nonTaxableEnabled: "on" })) data.set(key, value);
  return data;
}
describe("SMS credential privacy", () => {
  it.each(["ADMIN", "STAFF"])("omits the stored secret from %s client props and markup", async (role) => {
    mocks.auth.mockResolvedValue({ id: "user", role });
    const page = await SettingsPage();
    const component = page.props.children.find((child: { type?: unknown } | null) => child?.type === SettingsForm);
    expect(component.props.initial).not.toHaveProperty("textlkApiToken");
    expect(JSON.stringify(component.props)).not.toContain("never-send-this-secret");
    const html = renderToStaticMarkup(createElement(SettingsForm, component.props));
    expect(html).not.toContain("never-send-this-secret");
    if (role === "STAFF") expect(html).not.toContain('name="textlkApiToken"');
  });
  it("preserves an existing token on a routine blank submission", async () => {
    expect(await updateSettings({}, form())).toMatchObject({ ok: true });
    expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty("textlkApiToken");
  });
  it("allows explicit admin replacement and removal", async () => {
    const data = form(); data.set("textlkApiToken", "replacement");
    await updateSettings({}, data); expect(mocks.update.mock.calls[0][0].data.textlkApiToken).toBe("replacement");
    data.set("clearTextlkApiToken", "on"); await updateSettings({}, data);
    expect(mocks.update.mock.calls[1][0].data.textlkApiToken).toBeNull();
  });
  it("ignores staff attempts to replace or clear credentials", async () => {
    mocks.auth.mockResolvedValue({ id: "staff", role: "STAFF" });
    const data = form(); data.set("textlkApiToken", "malicious"); data.set("clearTextlkApiToken", "on");
    await updateSettings({}, data); expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty("textlkApiToken");
  });
});
