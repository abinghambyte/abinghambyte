import test from "node:test";
import assert from "node:assert/strict";
import { runNavigation, navToCallOutcome } from "./engine.ts";
import { createSimulatedSession } from "./simulated-session.ts";
import { sentryFlow, PROMPTS, event } from "./fixtures.ts";
import { interpret } from "../domain/interpret.ts";
import type { ResultGrammar } from "../domain/types.ts";
import type { PromptObservation } from "./types.ts";

const vars = { testingId: "1001", lastNameFirst3Dtmf: "336" };
const grammar: ResultGrammar = { clearPhrases: ["not required"], testPhrases: ["you are required"] };

function run(prompts: PromptObservation[], onRecord?: { transcript: string; confidence: number }) {
  const sim = createSimulatedSession({ prompts, onRecord });
  return runNavigation(sentryFlow, sim.session, { vars }).then((outcome) => ({ outcome, sim }));
}

test("happy path: language → id → name → result → completed", async () => {
  const { outcome, sim } = await run(
    [PROMPTS.language, PROMPTS.enterId, PROMPTS.enterName, PROMPTS.resultClear],
    { transcript: "you are not required to test today", confidence: 0.95 },
  );
  assert.equal(outcome.status, "completed");
  assert.deepEqual(sim.sent, ["1", "1001#", "336"]);
  const r = interpret({ kind: "sentry", callStatus: "completed", transcript: outcome.transcript, sttConfidence: outcome.confidence, grammar });
  assert.equal(r.status, "CLEAR");
});

test("invalid ID once, then success (retry loop works and is bounded)", async () => {
  const { outcome, sim } = await run(
    [PROMPTS.language, PROMPTS.enterId, PROMPTS.invalid, PROMPTS.enterId, PROMPTS.enterName, PROMPTS.resultTest],
    { transcript: "you are required to report today", confidence: 0.94 },
  );
  assert.equal(outcome.status, "completed");
  // ID sent twice (first rejected, second accepted).
  assert.deepEqual(sim.sent, ["1", "1001#", "1001#", "336"]);
  const r = interpret({ kind: "sentry", callStatus: "completed", transcript: outcome.transcript, sttConfidence: outcome.confidence, grammar });
  assert.equal(r.status, "MUST_TEST");
});

test("invalid ID exhausted → fails safe (retry_exhausted), never completed", async () => {
  const { outcome } = await run([
    PROMPTS.language,
    PROMPTS.enterId, PROMPTS.invalid,
    PROMPTS.enterId, PROMPTS.invalid,
    PROMPTS.enterId, PROMPTS.invalid,
  ]);
  assert.notEqual(outcome.status, "completed");
  assert.equal(outcome.status, "failed");
  const r = interpret({ kind: "sentry", callStatus: outcome.status, transcript: null, sttConfidence: 0, grammar });
  assert.equal(r.status, "UNREACHABLE");
});

test("voicemail → no_answer (verify yourself)", async () => {
  const { outcome, sim } = await run([event("voicemail")]);
  assert.equal(outcome.status, "no_answer");
  assert.equal(outcome.reason, "voicemail");
  assert.ok(sim.hungUp());
});

test("changed / unrecognized menu → menu_mismatch (fail safe, no guess)", async () => {
  const { outcome } = await run([PROMPTS.junk, PROMPTS.junk, PROMPTS.junk]);
  assert.equal(outcome.status, "menu_mismatch");
  const r = interpret({ kind: "sentry", callStatus: outcome.status, transcript: null, sttConfidence: 0, grammar });
  assert.equal(r.status, "UNREACHABLE");
});

test("dead air / silence never hangs — bounded and fails safe", async () => {
  const { outcome } = await run([]); // simulated session returns silence forever
  assert.notEqual(outcome.status, "completed");
});

test("navToCallOutcome maps into the worker's CallOutcome shape", async () => {
  const { outcome } = await run([PROMPTS.language, PROMPTS.enterId, PROMPTS.enterName, PROMPTS.resultClear], {
    transcript: "you are not required to test today",
    confidence: 0.95,
  });
  const co = navToCallOutcome(outcome);
  assert.equal(co.callStatus, "completed");
  assert.equal(co.sttConfidence, 0.95);
  assert.ok(co.digitsSent.includes("1001#"));
});
