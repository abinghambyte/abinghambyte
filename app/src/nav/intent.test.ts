import test from "node:test";
import assert from "node:assert/strict";
import { recognizeIntent } from "./intent.ts";
import { sentryFlow } from "./fixtures.ts";
import type { IntentRule } from "./types.ts";

const rules = sentryFlow.intents;

test("recognizes facility intents", () => {
  assert.equal(recognizeIntent({ text: "for English press 1" }, rules), "language");
  assert.equal(recognizeIntent({ text: "enter your identification number" }, rules), "enter_id");
  assert.equal(recognizeIntent({ text: "first three letters of your last name" }, rules), "enter_name");
  assert.equal(recognizeIntent({ text: "you are not required to test today" }, rules), "result");
});

test("recognizes built-in intents (invalid, voicemail, hold)", () => {
  assert.equal(recognizeIntent({ text: "that number is invalid, try again" }, rules), "invalid_id");
  assert.equal(recognizeIntent({ text: "leave a message after the beep" }, rules), "voicemail");
  assert.equal(recognizeIntent({ text: "please hold" }, rules), "hold");
});

test("transport events win over text", () => {
  assert.equal(recognizeIntent({ text: "you are not required", event: "voicemail" }, rules), "voicemail");
});

test("silence and unknown text → unknown", () => {
  assert.equal(recognizeIntent({ text: null, event: "silence" }, rules), "unknown");
  assert.equal(recognizeIntent({ text: "buy our data plans today" }, rules), "unknown");
});

test("facility rules take precedence over built-ins", () => {
  const facility: IntentRule[] = [{ intent: "result", anyOf: ["invalid selection is not our result"] }];
  // Facility "result" phrase contains "invalid" but must win over built-in invalid_id.
  assert.equal(recognizeIntent({ text: "an invalid selection is not our result today" }, facility), "result");
});
