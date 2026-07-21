import type { ResultGrammar } from "../domain/types.ts";
import type { IvrScript } from "../telephony/types.ts";
import type { SimReading, SimWorld } from "../telephony/simulator.ts";
import type { EnrolledUser, Facility } from "../worker/check.ts";

/**
 * A small but representative world for the demo. It exercises:
 *   - a color-code line (one shared call, several colors),
 *   - a personalized Sentry line (per-user results, incl. a low-confidence one),
 *   - a color line whose menu has changed (fails safe to "verify yourself").
 */

const COLORS = ["red", "orange", "yellow", "green", "blue", "purple", "black", "white", "gold"];

const colorGrammar: ResultGrammar = {
  clearPhrases: [],
  testPhrases: ["all colors", "everyone must", "all clients report"],
  colors: COLORS,
};

const sentryGrammar: ResultGrammar = {
  clearPhrases: ["not required", "no test", "are not scheduled"],
  testPhrases: ["you are required", "must report", "report today", "you must test"],
};

// --- IVR scripts (declarative per-facility menu navigation) -----------------

const colorScript = (facilityId: string, phone: string): IvrScript => ({
  facilityId,
  version: 3,
  phone,
  steps: [
    { wait: "prompt", expect: "language", timeoutSec: 20 },
    { sendDigits: "1" },
    { record: { start: "afterPrompt", expect: "result", maxSec: 30 } },
  ],
});

const sentryScript: IvrScript = {
  facilityId: "fac_sentry_b",
  version: 4,
  phone: "+1-970-295-4766",
  steps: [
    { wait: "prompt", expect: "language", timeoutSec: 20 },
    { sendDigits: "1" },
    { wait: "prompt", expect: "id", timeoutSec: 15 },
    { sendDigits: "{{user.testingId}}#" },
    { wait: "prompt", expect: "name", timeoutSec: 15 },
    { sendDigits: "{{user.lastNameFirst3Dtmf}}" },
    { record: { start: "afterPrompt", expect: "result", maxSec: 30 } },
  ],
};

// --- Facilities -------------------------------------------------------------

export const facilities: Facility[] = [
  {
    id: "fac_color_a",
    name: "County DRC — Color Line",
    kind: "color_code",
    timezone: "America/Denver",
    script: colorScript("fac_color_a", "+1-970-498-7545"),
    grammar: colorGrammar,
  },
  {
    id: "fac_sentry_b",
    name: "8th District — Sentry UA Line",
    kind: "sentry",
    timezone: "America/Denver",
    script: sentryScript,
    grammar: sentryGrammar,
  },
  {
    id: "fac_color_c",
    name: "County DRC — Non-Res Color Line (menu changed)",
    kind: "color_code",
    timezone: "America/Denver",
    script: colorScript("fac_color_c", "+1-970-498-7540"),
    grammar: colorGrammar,
  },
];

// --- Enrolled users per facility --------------------------------------------

export const enrollments: Record<string, EnrolledUser[]> = {
  fac_color_a: [
    { id: "u_ana", name: "Ana", color: "blue" }, // announced -> MUST_TEST
    { id: "u_ben", name: "Ben", color: "green" }, // not announced, high conf -> CLEAR
    { id: "u_cara", name: "Cara", color: "orange" }, // announced -> MUST_TEST
  ],
  fac_sentry_b: [
    { id: "u_dee", name: "Dee", vars: { testingId: "1001", lastNameFirst3Dtmf: "336" } }, // CLEAR
    { id: "u_eli", name: "Eli", vars: { testingId: "1002", lastNameFirst3Dtmf: "354" } }, // MUST_TEST
    { id: "u_fay", name: "Fay", vars: { testingId: "1003", lastNameFirst3Dtmf: "329" } }, // low conf -> AMBIGUOUS
  ],
  fac_color_c: [
    { id: "u_gus", name: "Gus", color: "blue" }, // menu changed -> UNREACHABLE
  ],
};

/** Ground truth for the safety self-check: who genuinely must test today. */
export const mustTestToday = new Set(["u_ana", "u_cara", "u_eli"]);

// --- The simulated line behavior -------------------------------------------

export const world: SimWorld = (facilityId, vars): SimReading => {
  if (facilityId === "fac_color_a") {
    return {
      menu: ["language", "result"],
      transcript: "blue and orange must report to the collection site today. All others are clear.",
      sttConfidence: 0.95,
    };
  }

  if (facilityId === "fac_sentry_b") {
    switch (vars.testingId) {
      case "1001":
        return { menu: ["language", "id", "name", "result"], transcript: "you are not required to test today", sttConfidence: 0.96 };
      case "1002":
        return { menu: ["language", "id", "name", "result"], transcript: "you are required to report today", sttConfidence: 0.93 };
      case "1003":
        // Same "clear" words, but a noisy line: too low-confidence to trust.
        return { menu: ["language", "id", "name", "result"], transcript: "you are not required to test today", sttConfidence: 0.62 };
      default:
        return { menu: ["language", "id", "name", "result"], transcript: null, sttConfidence: 0 };
    }
  }

  // fac_color_c: the line inserted a new "survey" prompt the script doesn't
  // expect -> the simulator reports menu_mismatch, and we fail safe.
  return {
    menu: ["language", "survey", "result"],
    transcript: "please stay on the line for a brief satisfaction survey",
    sttConfidence: 0.9,
  };
};
