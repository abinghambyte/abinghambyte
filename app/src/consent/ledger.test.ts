import test from "node:test";
import assert from "node:assert/strict";
import { canNotify, inQuietHours, type Consent } from "./ledger.ts";

const base: Consent = { userId: "u1", smsConsent: true, voiceConsent: true, optedOut: false };
const noon = new Date("2026-07-21T18:00:00Z"); // 12:00 MDT

test("consented, no quiet hours → ok", () => {
  assert.equal(canNotify(base, "sms", noon).ok, true);
  assert.equal(canNotify(base, "voice", noon).ok, true);
});

test("opted out → blocked on every channel", () => {
  const c = { ...base, optedOut: true };
  assert.equal(canNotify(c, "sms", noon).reason, "opted_out");
  assert.equal(canNotify(c, "voice", noon).reason, "opted_out");
});

test("missing channel consent → blocked for that channel only", () => {
  const c = { ...base, smsConsent: false };
  assert.equal(canNotify(c, "sms", noon).reason, "no_sms_consent");
  assert.equal(canNotify(c, "voice", noon).ok, true);
});

test("quiet hours block (with midnight wrap)", () => {
  const q = { start: "21:00", end: "08:00", timezone: "America/Denver" };
  const night = new Date("2026-07-22T04:00:00Z"); // 22:00 MDT → inside 21:00–08:00
  assert.equal(inQuietHours(night, q), true);
  assert.equal(inQuietHours(noon, q), false);
  assert.equal(canNotify({ ...base, quietHours: q }, "sms", night).reason, "quiet_hours");
});
