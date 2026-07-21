import test from "node:test";
import assert from "node:assert/strict";
import { createSimulator } from "../telephony/simulator.ts";
import { runFacilityCheck } from "./check.ts";
import { enrollments, facilities, mustTestToday, world } from "../demo/fixtures.ts";

const provider = createSimulator(world);
const DAY = "2026-07-21";
const NOW = "2026-07-21T17:05:00.000Z";

function facility(id: string) {
  const f = facilities.find((x) => x.id === id);
  assert.ok(f, `facility ${id}`);
  return f;
}

test("color line: one shared call resolves each user by their color", async () => {
  const f = facility("fac_color_a");
  const { sharedOutcome, userOutcomes } = await runFacilityCheck(f, enrollments[f.id], provider, DAY, NOW);

  assert.equal(sharedOutcome?.callStatus, "completed");
  const byName = Object.fromEntries(userOutcomes.map((u) => [u.user.name, u.result.status]));
  assert.equal(byName.Ana, "MUST_TEST"); // blue announced
  assert.equal(byName.Cara, "MUST_TEST"); // orange announced
  assert.equal(byName.Ben, "CLEAR"); // green not announced, high confidence
});

test("sentry line: per-user calls send the right DTMF and resolve per person", async () => {
  const f = facility("fac_sentry_b");
  const { userOutcomes } = await runFacilityCheck(f, enrollments[f.id], provider, DAY, NOW);

  const dee = userOutcomes.find((u) => u.user.name === "Dee");
  assert.ok(dee);
  assert.equal(dee.result.status, "CLEAR");
  assert.ok(dee.outcome.digitsSent.includes("1001#"), "sent Dee's testing ID");

  assert.equal(userOutcomes.find((u) => u.user.name === "Eli")?.result.status, "MUST_TEST");
  // Fay's line said "not required" but at low confidence → verify, not CLEAR.
  assert.equal(userOutcomes.find((u) => u.user.name === "Fay")?.result.status, "AMBIGUOUS");
});

test("changed menu fails safe to UNREACHABLE (verify yourself)", async () => {
  const f = facility("fac_color_c");
  const { userOutcomes } = await runFacilityCheck(f, enrollments[f.id], provider, DAY, NOW);
  assert.equal(userOutcomes[0].result.status, "UNREACHABLE");
  assert.equal(userOutcomes[0].notice.headline, "CALL THE LINE YOURSELF");
});

test("END-TO-END SAFETY: nobody who must test is ever told CLEAR", async () => {
  for (const f of facilities) {
    const { userOutcomes } = await runFacilityCheck(f, enrollments[f.id] ?? [], provider, DAY, NOW);
    for (const uo of userOutcomes) {
      if (mustTestToday.has(uo.user.id)) {
        assert.notEqual(uo.result.status, "CLEAR", `${uo.user.name} must test but got CLEAR`);
      }
      if (uo.result.status === "CLEAR") {
        assert.ok(uo.result.confidence >= 0.9, `${uo.user.name} CLEAR below confidence bar`);
      }
    }
  }
});

test("audit record captures transcript, decision, and script version", async () => {
  const f = facility("fac_color_a");
  const { userOutcomes } = await runFacilityCheck(f, enrollments[f.id], provider, DAY, NOW);
  const a = userOutcomes[0].audit;
  assert.equal(a.facilityId, "fac_color_a");
  assert.equal(a.scriptVersion, 3);
  assert.equal(a.day, DAY);
  assert.ok(a.transcript && a.transcript.length > 0);
  assert.equal(a.result.status, userOutcomes[0].result.status);
});
