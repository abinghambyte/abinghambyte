import type { NavFlow, PromptObservation } from "./types.ts";

/**
 * A representative Sentry-style flow: language menu → enter ID → enter last-name
 * letters → result. It tolerates a leading greeting, retries on "invalid ID"
 * (guarded), and can also capture the result directly after the ID (some lines
 * skip the name step).
 */
export const sentryFlow: NavFlow = {
  facilityId: "fac_sentry_demo",
  version: 1,
  phone: "+1-970-295-4766",
  start: "s_language",
  maxTurns: 25,
  intents: [
    { intent: "language", anyOf: ["for english press", "press 1 for english", "para espanol"] },
    { intent: "enter_id", anyOf: ["identification number", "enter your id", "client id", "enter your identification"] },
    { intent: "enter_name", anyOf: ["first three letters", "letters of your last name", "your last name"] },
    { intent: "result", anyOf: ["you are required", "you are not required", "must report", "not scheduled"] },
    // "invalid_id" and "voicemail" come from the built-in rules in intent.ts.
  ],
  states: {
    s_language: {
      id: "s_language",
      on: [{ intent: "language", action: { type: "sendDigits", digits: "1" }, next: "s_id" }],
      default: { action: { type: "wait" } }, // tolerate an intro before the language menu
    },
    s_id: {
      id: "s_id",
      maxVisits: 3, // 3 bad ID attempts → fail safe (likely wrong credentials)
      on: [{ intent: "enter_id", action: { type: "sendDigits", digits: "{{user.testingId}}#" }, next: "s_after_id" }],
      default: { action: { type: "wait" } },
    },
    s_after_id: {
      id: "s_after_id",
      on: [
        { intent: "invalid_id", action: { type: "wait" }, next: "s_id" }, // retry
        { intent: "enter_name", action: { type: "sendDigits", digits: "{{user.lastNameFirst3Dtmf}}" }, next: "s_result" },
        { intent: "result", action: { type: "record", maxSec: 30 } }, // some lines skip the name step
      ],
      default: { action: { type: "wait" } },
    },
    s_result: {
      id: "s_result",
      on: [{ intent: "result", action: { type: "record", maxSec: 30 } }],
      default: { action: { type: "record", maxSec: 30 } }, // capture whatever plays; confidence gate handles trust
    },
  },
};

/** Convenience builders for prompt observations in tests/demos. */
export const say = (text: string): PromptObservation => ({ text });
export const event = (e: PromptObservation["event"]): PromptObservation => ({ text: null, event: e });

export const PROMPTS = {
  language: say("Thank you for calling. For English press 1, para espanol oprima dos."),
  enterId: say("Please enter your identification number followed by the pound sign."),
  invalid: say("That number is invalid, please try again."),
  enterName: say("Enter the first three letters of your last name."),
  resultClear: say("You are not required to test today."),
  resultTest: say("You are required to report today."),
  junk: say("Welcome to Acme Telecom, ask us about our new data plans."),
};
