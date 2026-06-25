import "server-only";
import { toTextLkPhone } from "./phone";

export type SmsResult = { ok: boolean; simulated?: boolean; error?: string };

/**
 * Sends an SMS via text.lk. The API token is resolved from the passed `token`
 * (stored in Settings) first, then the `TEXTLK_API_TOKEN` env var. If neither is
 * configured the message is logged instead and reported as a simulated success —
 * so the whole flow works in development before SMS credentials are added.
 */
export async function sendSms(
  to: string,
  message: string,
  senderId?: string,
  token?: string | null,
): Promise<SmsResult> {
  const phone = toTextLkPhone(to);
  if (!phone) return { ok: false, error: "Invalid phone number" };

  const apiToken = token || process.env.TEXTLK_API_TOKEN;
  if (!apiToken) {
    console.log(`[SMS simulated] -> ${phone}: ${message}`);
    return { ok: true, simulated: true };
  }

  try {
    const res = await fetch("https://app.text.lk/api/v3/sms/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        recipient: phone,
        sender_id: senderId || process.env.TEXTLK_SENDER_ID || "Madagama",
        type: "plain",
        message,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `text.lk ${res.status}: ${body.slice(0, 140)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
