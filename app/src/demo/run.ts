import { createSimulator } from "../telephony/simulator.ts";
import { renderNotice } from "../notify/plan.ts";
import { runFacilityCheck, type UserOutcome } from "../worker/check.ts";
import { enrollments, facilities, mustTestToday, world } from "./fixtures.ts";

/**
 * End-to-end demo: run one day's check for every facility, driven entirely by
 * the telephony simulator. No network, no cost, no real lines called.
 *
 *   node --experimental-strip-types src/demo/run.ts
 */

const DAY = "2026-07-21";
const NOW = new Date().toISOString();

function line(char = "─"): string {
  return char.repeat(72);
}

async function main(): Promise<void> {
  const provider = createSimulator(world);
  const allOutcomes: UserOutcome[] = [];

  console.log(`\n${line("═")}`);
  console.log(`  Clearline — daily check  ·  ${DAY}  (simulated lines)`);
  console.log(line("═"));

  for (const facility of facilities) {
    const users = enrollments[facility.id] ?? [];
    const { sharedOutcome, userOutcomes } = await runFacilityCheck(facility, users, provider, DAY, NOW);

    console.log(`\n▶ ${facility.name}   [${facility.kind}]`);

    if (sharedOutcome) {
      // Color line: one shared call for everyone.
      console.log(`  call: ${sharedOutcome.callStatus}`);
      for (const ev of sharedOutcome.events) console.log(`    · ${ev}`);
      if (sharedOutcome.transcript) console.log(`  heard: "${sharedOutcome.transcript}"`);
    }

    for (const uo of userOutcomes) {
      if (!sharedOutcome) {
        // Sentry line: per-user call.
        console.log(`  ${uo.user.name} (ID ${uo.user.vars?.testingId}) → call: ${uo.outcome.callStatus}`);
        console.log(`    digits sent: ${uo.outcome.digitsSent.join(", ") || "—"}`);
        if (uo.outcome.transcript) console.log(`    heard: "${uo.outcome.transcript}" (conf ${uo.outcome.sttConfidence.toFixed(2)})`);
      }
      console.log(`  ${uo.user.name}: ${uo.result.status}` + ("evidence" in uo.result ? `  — ${uo.result.evidence}` : "reason" in uo.result ? `  — ${uo.result.reason}` : ""));
      console.log(renderNotice(uo.notice));
      allOutcomes.push(uo);
    }
  }

  // --- Summary --------------------------------------------------------------
  const counts: Record<string, number> = {};
  for (const uo of allOutcomes) counts[uo.result.status] = (counts[uo.result.status] ?? 0) + 1;

  console.log(`\n${line()}`);
  console.log("  Summary: " + Object.entries(counts).map(([k, v]) => `${v} ${k}`).join("  ·  "));

  // --- Safety self-checks (the whole point) ---------------------------------
  const falseClears = allOutcomes.filter(
    (uo) => mustTestToday.has(uo.user.id) && uo.result.status === "CLEAR",
  );
  const badClears = allOutcomes.filter(
    (uo) => uo.result.status === "CLEAR" && uo.result.confidence < 0.9,
  );

  console.log(line());
  if (falseClears.length === 0) {
    console.log("  SAFETY ✓  no one who must test today was told they were CLEAR");
  } else {
    console.log(`  SAFETY ✗  FALSE CLEAR for: ${falseClears.map((u) => u.user.name).join(", ")}`);
  }
  if (badClears.length === 0) {
    console.log("  SAFETY ✓  every CLEAR met the high confidence bar (≥ 0.90)");
  } else {
    console.log(`  SAFETY ✗  low-confidence CLEAR for: ${badClears.map((u) => u.user.name).join(", ")}`);
  }
  console.log(`${line("═")}\n`);

  if (falseClears.length > 0 || badClears.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
