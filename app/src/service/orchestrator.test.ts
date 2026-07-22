import test from "node:test";
import assert from "node:assert/strict";
import { runServiceTick } from "./orchestrator.ts";
import { createMemoryStore } from "../store/memory.ts";
import { aesGcmEncryptor, devKeyFromPassphrase } from "../crypto/field.ts";
import { createSimulator } from "../telephony/simulator.ts";
import { facilities as demoFacilities, world } from "../demo/fixtures.ts";
import type { Consent } from "../consent/ledger.ts";
import type { Store } from "../store/types.ts";
import type { Facility } from "../worker/check.ts";

const provider = createSimulator(world);
const fullConsent = (userId: string): Consent => ({ userId, smsConsent: true, voiceConsent: true, optedOut: false });

function facility(id: string, resultsAfter: string): Facility {
  const f = demoFacilities.find((x) => x.id === id);
  assert.ok(f);
  return { ...f, timezone: "America/Denver", resultsAfter };
}

function freshStore(): Store {
  return createMemoryStore(aesGcmEncryptor(devKeyFromPassphrase("orch-test")));
}

// July: Denver is MDT (UTC-6). 23:30 UTC = 17:30 MDT.
const at1730 = new Date("2026-07-21T23:30:00Z");

test("due color facility runs, persists audits, gates notifications by consent", async () => {
  const store = freshStore();
  store.addFacility(facility("fac_color_a", "17:00"));
  store.addUser({ id: "u_ana", name: "Ana", phone: "+19705550001", consent: fullConsent("u_ana") });
  store.addUser({ id: "u_ben", name: "Ben", phone: "+19705550002", consent: { ...fullConsent("u_ben"), optedOut: true } });
  store.enroll({ userId: "u_ana", facilityId: "fac_color_a", color: "blue" }); // announced → MUST_TEST
  store.enroll({ userId: "u_ben", facilityId: "fac_color_a", color: "green" }); // clear, but opted out

  const r = await runServiceTick({ now: at1730, store, provider });

  assert.deepEqual(r.ranFacilities, ["fac_color_a"]);
  assert.equal(r.audits, 2);
  assert.equal(r.notificationsSent, 2); // Ana MUST_TEST → sms + voice
  assert.equal(r.notificationsSuppressed, 1); // Ben opted out → sms suppressed
  assert.equal(store.notifications().find((n) => n.userId === "u_ben")?.reason, "opted_out");
});

test("idempotent: a second tick the same local day does nothing", async () => {
  const store = freshStore();
  store.addFacility(facility("fac_color_a", "17:00"));
  store.addUser({ id: "u_ana", name: "Ana", phone: "+1970", consent: fullConsent("u_ana") });
  store.enroll({ userId: "u_ana", facilityId: "fac_color_a", color: "blue" });

  await runServiceTick({ now: at1730, store, provider });
  const again = await runServiceTick({ now: at1730, store, provider });
  assert.deepEqual(again.ranFacilities, []);
  assert.deepEqual(again.skippedAlreadyRan, ["fac_color_a"]);
  assert.equal(again.audits, 0);
});

test("facility not yet past its local window is skipped", async () => {
  const store = freshStore();
  store.addFacility(facility("fac_sentry_b", "23:00")); // after 17:30 local
  store.addUser({ id: "u_dee", name: "Dee", phone: "+1970", consent: fullConsent("u_dee") });
  store.enroll({ userId: "u_dee", facilityId: "fac_sentry_b", vars: { testingId: "1001", lastNameFirst3Dtmf: "336" } });

  const r = await runServiceTick({ now: at1730, store, provider });
  assert.deepEqual(r.notYetDue, ["fac_sentry_b"]);
  assert.deepEqual(r.ranFacilities, []);
});

test("encrypted call vars decrypt end-to-end (Sentry DTMF proves it)", async () => {
  const store = freshStore();
  store.addFacility(facility("fac_sentry_b", "00:00")); // always due
  store.addUser({ id: "u_dee", name: "Dee", phone: "+1970", consent: fullConsent("u_dee") });
  store.enroll({ userId: "u_dee", facilityId: "fac_sentry_b", vars: { testingId: "1001", lastNameFirst3Dtmf: "336" } });

  await runServiceTick({ now: at1730, store, provider });
  const audit = store.auditsForUser("u_dee")[0];
  assert.ok(audit, "audit persisted");
  assert.ok(audit.digitsSent.includes("1001#"), "decrypted testing ID reached the dialer");
});
