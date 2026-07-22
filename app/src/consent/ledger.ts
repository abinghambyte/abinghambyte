import { localHHMM } from "../schedule/scheduler.ts";

/**
 * TCPA consent gate. Automated SMS/voice to individuals is federally regulated:
 * you need prior express consent, must honor opt-out (STOP), and should respect
 * quiet hours. This is the ledger + the check every notification passes through.
 *
 * NOTE: whether an urgent MUST_TEST alert may override quiet hours is a legal
 * question for counsel — the gate exposes the reason so that policy lives in one
 * place, not scattered through the notify code.
 */

export interface QuietHours {
  start: string; // "HH:MM" local
  end: string; // "HH:MM" local (may wrap past midnight)
  timezone: string;
}

export interface Consent {
  userId: string;
  smsConsent: boolean;
  voiceConsent: boolean;
  optedOut: boolean; // set when the user replies STOP
  quietHours?: QuietHours;
}

export interface NotifyGate {
  ok: boolean;
  reason?: string;
}

/** True if `now` falls within the quiet-hours window (handles midnight wrap). */
export function inQuietHours(now: Date, q: QuietHours): boolean {
  const t = localHHMM(now, q.timezone);
  if (q.start <= q.end) return t >= q.start && t < q.end; // same-day window
  return t >= q.start || t < q.end; // wraps past midnight (e.g. 21:00–08:00)
}

/** Decide whether we may send on `channel` to a consented user right now. */
export function canNotify(consent: Consent, channel: string, now: Date): NotifyGate {
  if (consent.optedOut) return { ok: false, reason: "opted_out" };
  if (channel === "sms" && !consent.smsConsent) return { ok: false, reason: "no_sms_consent" };
  if (channel === "voice" && !consent.voiceConsent) return { ok: false, reason: "no_voice_consent" };
  if (consent.quietHours && inQuietHours(now, consent.quietHours)) return { ok: false, reason: "quiet_hours" };
  return { ok: true };
}
