import test from "node:test";
import assert from "node:assert/strict";
import { interpret, CLEAR_MIN_CONFIDENCE } from "./interpret.ts";
import type { InterpretInput, ResultGrammar } from "./types.ts";

const sentryGrammar: ResultGrammar = {
  clearPhrases: ["not required", "no test"],
  testPhrases: ["you are required", "must report"],
};

const colorGrammar: ResultGrammar = {
  clearPhrases: [],
  testPhrases: ["all colors"],
  colors: ["red", "orange", "green", "blue", "gold"],
};

function sentry(transcript: string | null, sttConfidence: number): InterpretInput {
  return { kind: "sentry", callStatus: "completed", transcript, sttConfidence, grammar: sentryGrammar };
}
function color(transcript: string | null, sttConfidence: number, userColor: string | null): InterpretInput {
  return { kind: "color_code", callStatus: "completed", transcript, sttConfidence, grammar: colorGrammar, userColor };
}

// --- Sentry -----------------------------------------------------------------

test("sentry: clear phrase at high confidence → CLEAR", () => {
  assert.equal(interpret(sentry("you are not required to test today", 0.95)).status, "CLEAR");
});

test("sentry: clear phrase but low confidence → AMBIGUOUS (never CLEAR)", () => {
  assert.equal(interpret(sentry("you are not required to test today", 0.7)).status, "AMBIGUOUS");
});

test("sentry: test phrase → MUST_TEST", () => {
  assert.equal(interpret(sentry("you are required to report today", 0.93)).status, "MUST_TEST");
});

test("sentry: test phrase even at low confidence → MUST_TEST (fail toward testing)", () => {
  assert.equal(interpret(sentry("you must report today", 0.3)).status, "MUST_TEST");
});

test("sentry: conflicting phrases → AMBIGUOUS", () => {
  assert.equal(interpret(sentry("you are required ... no test", 0.99)).status, "AMBIGUOUS");
});

test("sentry: no matching phrase → AMBIGUOUS", () => {
  assert.equal(interpret(sentry("thank you for calling", 0.99)).status, "AMBIGUOUS");
});

// --- Color code -------------------------------------------------------------

test("color: user's color announced → MUST_TEST", () => {
  assert.equal(interpret(color("blue and orange report today", 0.97, "blue")).status, "MUST_TEST");
});

test("color: user's color NOT announced, high confidence → CLEAR", () => {
  assert.equal(interpret(color("blue and orange report today", 0.97, "green")).status, "CLEAR");
});

test("color: user's color NOT announced, but low confidence → AMBIGUOUS", () => {
  assert.equal(interpret(color("blue and orange report today", 0.6, "green")).status, "AMBIGUOUS");
});

test("color: no colors recognized → AMBIGUOUS", () => {
  assert.equal(interpret(color("please hold for the next message", 0.99, "green")).status, "AMBIGUOUS");
});

test("color: 'all colors' phrase → MUST_TEST for everyone", () => {
  assert.equal(interpret(color("all colors report today", 0.99, "green")).status, "MUST_TEST");
});

test("color: word-boundary — 'red' does not match inside 'hundred'", () => {
  // "hundred" contains "red" as a substring; must NOT trigger MUST_TEST for red.
  assert.equal(interpret(color("blue report, one hundred percent", 0.97, "red")).status, "CLEAR");
});

test("color: missing assigned color → AMBIGUOUS", () => {
  assert.equal(interpret(color("blue report today", 0.97, null)).status, "AMBIGUOUS");
});

// --- Unreachable / no audio -------------------------------------------------

for (const status of ["busy", "no_answer", "menu_mismatch", "failed"] as const) {
  test(`callStatus ${status} → UNREACHABLE`, () => {
    assert.equal(interpret({ ...sentry("anything", 0.99), callStatus: status }).status, "UNREACHABLE");
  });
}

test("completed but null transcript → AMBIGUOUS", () => {
  assert.equal(interpret(sentry(null, 0.99)).status, "AMBIGUOUS");
});

// --- The golden invariants --------------------------------------------------

test("INVARIANT: any CLEAR has confidence ≥ CLEAR_MIN_CONFIDENCE", () => {
  const confidences = [0, 0.2, 0.5, 0.7, 0.89, 0.9, 0.95, 1];
  const transcripts = [
    "you are not required to test today",
    "you are required to report today",
    "blue and orange report today",
    "thank you for calling",
    "all colors report today",
    "",
  ];
  for (const c of confidences) {
    for (const t of transcripts) {
      for (const r of [interpret(sentry(t, c)), interpret(color(t, c, "green")), interpret(color(t, c, "blue"))]) {
        if (r.status === "CLEAR") assert.ok(r.confidence >= CLEAR_MIN_CONFIDENCE, `CLEAR at conf ${r.confidence} for "${t}"`);
      }
    }
  }
});

test("INVARIANT: no false CLEAR — when the truth is MUST_TEST, never CLEAR", () => {
  const confidences = [0, 0.5, 0.89, 0.9, 0.95, 1];

  // Sentry truths that require testing.
  for (const c of confidences) {
    for (const t of ["you are required to report today", "you must report today", "you are required ... but no test"]) {
      assert.notEqual(interpret(sentry(t, c)).status, "CLEAR", `sentry "${t}" @ ${c}`);
    }
  }

  // Color truths: the user's color IS announced (possibly among others / garbled).
  for (const c of confidences) {
    for (const t of ["blue report today", "red orange blue green report", "all colors report today", "blue"]) {
      assert.notEqual(interpret(color(t, c, "blue")).status, "CLEAR", `color "${t}" @ ${c}`);
    }
  }
});
