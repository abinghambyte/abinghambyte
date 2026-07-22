import { createMemoryStore } from "../store/memory.ts";
import { aesGcmEncryptor, devKeyFromPassphrase } from "../crypto/field.ts";
import { createSimulator } from "../telephony/simulator.ts";
import { runServiceTick } from "../service/orchestrator.ts";
import { facilities as demoFacilities, world } from "./fixtures.ts";
import { localHHMM } from "../schedule/scheduler.ts";
import type { Consent } from "../consent/ledger.ts";
import type { Facility } from "../worker/check.ts";

/**
 * Service tick demo: persistence (encrypted PII) + timezone scheduling + TCPA
 * consent gating + idempotency, wired to the simulator. No telephony, no DB.
 *
 *   node --experimental-strip-types src/demo/run-service.ts
 */

const bar = (c = "─"): string => c.repeat(72);
const consent = (userId: string, over: Partial<Consent> = {}): Consent => ({
  userId, smsConsent: true, voiceConsent: true, optedOut: false, ...over,
});

function facility(id: string, resultsAfter: string): Facility {
  const f = demoFacilities.find((x) => x.id === id);
  if (!f) throw new Error(id);
  return { ...f, timezone: "America/Denver", resultsAfter };
}

async function main(): Promise<void> {
  const store = createMemoryStore(aesGcmEncryptor(devKeyFromPassphrase("demo-key")));

  // Two facilities: a color line available after 17:00, and a Sentry line after 23:00.
  store.addFacility(facility("fac_color_a", "17:00"));
  store.addFacility(facility("fac_sentry_b", "23:00"));

  store.addUser({ id: "u_ana", name: "Ana", phone: "+19705550001", consent: consent("u_ana") });
  store.addUser({ id: "u_ben", name: "Ben", phone: "+19705550002", consent: consent("u_ben", { optedOut: true }) });
  store.addUser({ id: "u_dee", name: "Dee", phone: "+19705550003", consent: consent("u_dee") });

  store.enroll({ userId: "u_ana", facilityId: "fac_color_a", color: "blue" }); // announced → test
  store.enroll({ userId: "u_ben", facilityId: "fac_color_a", color: "green" }); // clear, but opted out
  store.enroll({ userId: "u_dee", facilityId: "fac_sentry_b", vars: { testingId: "1001", lastNameFirst3Dtmf: "336" } });

  const provider = createSimulator(world);
  const now = new Date("2026-07-21T23:30:00Z"); // 17:30 America/Denver

  console.log(`\n${bar("═")}`);
  console.log(`  Clearline service tick  ·  ${localHHMM(now, "America/Denver")} America/Denver`);
  console.log("  (PII encrypted at rest · scheduling in facility-local time · TCPA consent gate)");
  console.log(bar("═"));

  const r1 = await runServiceTick({ now, store, provider });
  console.log(`\n  ran: [${r1.ranFacilities.join(", ")}]   not-yet-due: [${r1.notYetDue.join(", ")}]`);
  console.log(`  audits saved: ${r1.audits}   notifications sent: ${r1.notificationsSent}   suppressed: ${r1.notificationsSuppressed}`);

  console.log(`\n  Notifications:`);
  for (const n of store.notifications()) {
    const mark = n.status === "sent" ? "✅ sent " : `🚫 supp.(${n.reason})`;
    console.log(`    ${mark}  ${n.userId}  [${n.channel}]  ${n.headline}`);
  }

  console.log(`\n  Second tick at the same local day (idempotency):`);
  const r2 = await runServiceTick({ now, store, provider });
  console.log(`    ran: [${r2.ranFacilities.join(", ") || "—"}]   already-ran: [${r2.skippedAlreadyRan.join(", ")}]`);

  console.log(`\n${bar("═")}`);
  console.log("  fac_sentry_b was skipped (not past 23:00 local); it runs on a later tick.");
  console.log(`${bar("═")}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
