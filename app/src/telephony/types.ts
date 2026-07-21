import type { CallStatus } from "../domain/types.ts";

/** One step in navigating a facility's phone menu. */
export type IvrStep =
  | { wait: "prompt"; expect: string; timeoutSec: number }
  | { sendDigits: string }
  | { record: { start: string; expect: string; maxSec: number } };

/**
 * A declarative, per-facility script for navigating the line. It is data, not
 * code, so scripts can be versioned and edited without a deploy. `{{user.*}}`
 * fields in `sendDigits` are substituted per person at call time.
 */
export interface IvrScript {
  facilityId: string;
  version: number;
  phone: string;
  steps: IvrStep[];
}

/** Per-user substitution values for {{user.*}} fields in a script. */
export interface CallVars {
  testingId?: string;
  lastNameFirst3Dtmf?: string;
}

export interface CallOutcome {
  callStatus: CallStatus;
  transcript: string | null;
  sttConfidence: number;
  digitsSent: string[];
  /** Human-readable trace of what happened on the call (for the audit log). */
  events: string[];
}

export interface PlaceCallOpts {
  script: IvrScript;
  vars?: CallVars;
}

/**
 * The telephony abstraction. Swappable adapters implement this: a simulator
 * (for development, CI, and demos — no cost, no real calls), and later Twilio /
 * Asterisk for real outbound calls.
 */
export interface TelephonyProvider {
  placeCall(opts: PlaceCallOpts): Promise<CallOutcome>;
}
