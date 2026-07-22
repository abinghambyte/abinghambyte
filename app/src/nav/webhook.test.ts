import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryNavSessions, createWebhookNavigator } from "./webhook.ts";
import { sentryFlow, PROMPTS, event } from "./fixtures.ts";
import { navToCallOutcome } from "./engine.ts";
import { interpret } from "../domain/interpret.ts";
import type { PromptObservation } from "./types.ts";
import type { ResultGrammar } from "../domain/types.ts";

const vars = { testingId: "1001", lastNameFirst3Dtmf: "336" };
const grammar: ResultGrammar = { clearPhrases: ["not required"], testPhrases: ["you are required"] };
const ACTION = "https://svc.example/twilio/voice/CA1";

/** Drive a full call as a sequence of webhooks; return the final step. */
function driveCall(prompts: PromptObservation[]) {
  const sessions = createMemoryNavSessions();
  const nav = createWebhookNavigator(sessions);
  sessions.start("CA1", sentryFlow, vars);

  const twimls: string[] = [];
  let step = nav.onCallStart("CA1", ACTION);
  twimls.push(step.twiml);

  for (const obs of prompts) {
    if (step.done) break;
    step = nav.onObservation("CA1", obs, ACTION);
    twimls.push(step.twiml);
  }
  return { step, twimls };
}

test("happy path over webhooks → completed, correct DTMF, CLEAR", () => {
  const { step, twimls } = driveCall([
    PROMPTS.language,
    PROMPTS.enterId,
    PROMPTS.enterName,
    { ...PROMPTS.resultClear, confidence: 0.95 },
  ]);
  assert.equal(step.done, true);
  assert.equal(step.outcome?.status, "completed");

  // The DTMF we chose appears in the TwiML we returned to Twilio.
  const all = twimls.join("\n");
  assert.match(all, /<Play digits="1"\/>/);
  assert.match(all, /<Play digits="1001#"\/>/);
  assert.match(all, /<Play digits="336"\/>/);
  assert.match(all, /<Gather input="speech"/);

  const co = navToCallOutcome(step.outcome!);
  const r = interpret({ kind: "sentry", callStatus: co.callStatus, transcript: co.transcript, sttConfidence: co.sttConfidence, grammar });
  assert.equal(r.status, "CLEAR");
});

test("invalid-ID retry over webhooks → completed", () => {
  const { step } = driveCall([
    PROMPTS.language,
    PROMPTS.enterId,
    PROMPTS.invalid,
    PROMPTS.enterId,
    PROMPTS.enterName,
    { ...PROMPTS.resultTest, confidence: 0.94 },
  ]);
  assert.equal(step.outcome?.status, "completed");
  const r = interpret({ kind: "sentry", callStatus: "completed", transcript: step.outcome!.transcript, sttConfidence: step.outcome!.confidence, grammar });
  assert.equal(r.status, "MUST_TEST");
});

test("voicemail over webhooks → no_answer + Hangup", () => {
  const { step } = driveCall([event("voicemail")]);
  assert.equal(step.outcome?.status, "no_answer");
  assert.match(step.twiml, /<Hangup\/>/);
});

test("changed menu over webhooks → menu_mismatch (fail safe)", () => {
  const { step } = driveCall([PROMPTS.junk, PROMPTS.junk, PROMPTS.junk]);
  assert.equal(step.outcome?.status, "menu_mismatch");
});

test("low-confidence result → AMBIGUOUS through interpret (never CLEAR)", () => {
  const { step } = driveCall([
    PROMPTS.language,
    PROMPTS.enterId,
    PROMPTS.enterName,
    { ...PROMPTS.resultClear, confidence: 0.55 },
  ]);
  const r = interpret({ kind: "sentry", callStatus: "completed", transcript: step.outcome!.transcript, sttConfidence: step.outcome!.confidence, grammar });
  assert.equal(r.status, "AMBIGUOUS");
});

test("unknown CallSid fails safe", () => {
  const sessions = createMemoryNavSessions();
  const nav = createWebhookNavigator(sessions);
  const step = nav.onObservation("CA-nope", PROMPTS.language, ACTION);
  assert.equal(step.done, true);
  assert.match(step.twiml, /<Hangup\/>/);
});
