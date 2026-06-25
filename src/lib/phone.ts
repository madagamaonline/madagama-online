// Sri Lankan phone number helpers — shared by client forms and server actions.
// Numbers are entered in any common local form and stored in a single canonical
// local form (0XXXXXXXXX) so duplicate checks are reliable.

/**
 * Normalise a Sri Lankan phone number to canonical local form `0XXXXXXXXX`
 * (10 digits). Accepts `94…`, `0…`, and bare 9-digit `7XXXXXXXX` inputs.
 * Returns null when there is nothing usable.
 */
export function normalizeLkPhone(raw: string): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("94")) return "0" + digits.slice(2);
  if (digits.startsWith("0")) return digits;
  if (digits.length === 9) return "0" + digits; // 7XXXXXXXX
  return digits;
}

/** text.lk wants the international form 94XXXXXXXXX. */
export function toTextLkPhone(raw: string): string | null {
  const local = normalizeLkPhone(raw);
  if (!local) return null;
  return local.startsWith("0") ? "94" + local.slice(1) : local;
}

export type PhoneValidation =
  | { ok: true; normalized: string }
  | { ok: false; error: string };

const LOCAL_RE = /^0\d{9}$/;

/**
 * Validate a Sri Lankan phone number. Accepts the formats people actually type:
 *  - 9 digits starting with 7 (e.g. 771234567)
 *  - 10 digits starting with 0 (e.g. 0771234567)
 *  - international 94XXXXXXXXX
 * On success returns the canonical local form to store.
 */
export function validateLkPhone(raw: string): PhoneValidation {
  const normalized = normalizeLkPhone(raw);
  if (!normalized || !LOCAL_RE.test(normalized)) {
    return {
      ok: false,
      error: "Enter a valid Sri Lankan phone number (e.g. 0771234567 or 771234567).",
    };
  }
  return { ok: true, normalized };
}
