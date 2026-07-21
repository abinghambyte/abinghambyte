import { runNavigation, navToCallOutcome } from "../nav/engine.ts";
import { createSimulatedSession } from "../nav/simulated-session.ts";
import { sentryFlow, PROMPTS, event } from "../nav/fixtures.ts";
import { interpret } from "../domain/interpret.ts";
import { planNotice, renderNotice } from "../notify/plan.ts";
import type { PromptObservation } from "../nav/types.ts";
import type { ResultGrammar } from "../domain/types.ts";

/**
 * Demo: the navigation engine steering a call through a *messy* IVR — a leading
 * junk greeting, a rejected first ID (retry), then the result — with no
 * telephony. Also shows two fail-safe endings.
 *
 *   node --experimental-strip-types src/demo/run-nav.ts
 */

const vars = { testingId: "1001", lastNameFirst3Dtmf: "336" };
const grammar: ResultGrammar = { clearPhrases: ["not required"], testPhrases: ["you are required"] };

function bar(c = "─"): string {
  return c.repeat(72);
}

async function scenario(title: string, prompts: PromptObservation[], onRecord?: { transcript: string; confidence: number }) {
  const sim = createSimulatedSession({ prompts, onRecord });
  const outcome = await runNavigation(sentryFlow, sim.session, { vars });

  console.log(`\n▶ ${title}`);
  for (const ev of outcome.events) console.log(`    · ${ev}`);
  console.log(`  digits sent: ${sim.sent.join(", ") || "—"}`);

  const co = navToCallOutcome(outcome);
  const result = interpret({
    kind: "sentry",
    callStatus: co.callStatus,
    transcript: co.transcript,
    sttConfidence: co.sttConfidence,
    grammar,
  });
  console.log(`  → nav: ${outcome.status}${outcome.reason ? ` (${outcome.reason})` : ""}   decision: ${result.status}`);
  console.log(renderNotice(planNotice({ id: "u_demo", name: "Sam" }, result)));
}

async function main(): Promise<void> {
  console.log(`\n${bar("═")}`);
  console.log("  Clearline — IVR navigation engine (simulated call sessions)");
  console.log(bar("═"));

  await scenario(
    "Messy line: junk intro, rejected ID (retry), then result",
    [PROMPTS.junk, PROMPTS.language, PROMPTS.enterId, PROMPTS.invalid, PROMPTS.enterId, PROMPTS.enterName, PROMPTS.resultClear],
    { transcript: "you are not required to test today", confidence: 0.95 },
  );

  await scenario("Wrong credentials: 3 rejects → fail safe", [
    PROMPTS.language,
    PROMPTS.enterId, PROMPTS.invalid,
    PROMPTS.enterId, PROMPTS.invalid,
    PROMPTS.enterId, PROMPTS.invalid,
  ]);

  await scenario("Answering machine → fail safe", [event("voicemail")]);

  await scenario("Menu changed (unrecognized prompts) → fail safe", [PROMPTS.junk, PROMPTS.junk, PROMPTS.junk]);

  console.log(`\n${bar("═")}`);
  console.log("  Every non-'completed' path resolves to 'verify yourself' — never a guess.");
  console.log(`${bar("═")}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
