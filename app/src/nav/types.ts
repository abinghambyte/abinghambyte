import type { CallStatus } from "../domain/types.ts";
import type { CallVars } from "../telephony/types.ts";

/**
 * The navigation policy model. A per-facility state machine that drives a call
 * through an IVR: perceive a prompt → recognize an INTENT → take an ACTION.
 * Pure and deterministic; the transport (Gather-webhook or Media Streams) is a
 * separate adapter that implements `CallSession`. See docs/IVR-NAVIGATION.md.
 */

export type IntentName = string;

/** Facility-specific phrase → intent rule (first match wins; facility rules
 *  are checked before the built-ins in intent.ts). */
export interface IntentRule {
  intent: IntentName;
  anyOf: string[];
}

export type NavAction =
  | { type: "sendDigits"; digits: string } // supports {{user.*}} substitution
  | { type: "wait" } // let the prompt keep playing; observe again
  | { type: "record"; maxSec: number } // capture the result → done
  | { type: "hangup" }
  | { type: "flag"; reason: string }; // fail safe → operator + verify-yourself

export interface NavTransition {
  intent: IntentName;
  action: NavAction;
  next?: string;
}

export interface NavState {
  id: string;
  on: NavTransition[];
  default?: { action: NavAction; next?: string };
  /** Loop guard: e.g. an "enter ID" state visited > N times → fail safe. */
  maxVisits?: number;
}

export interface NavFlow {
  facilityId: string;
  version: number;
  phone: string;
  start: string;
  intents: IntentRule[];
  states: Record<string, NavState>;
  /** Hard cap on total turns; the call can never run forever. */
  maxTurns?: number;
}

/** What we observed on the line this turn. */
export interface PromptObservation {
  /** ASR of the prompt (null on silence/timeout). */
  text: string | null;
  /** Inline ASR confidence 0..1, when the transport provides one (e.g. Twilio Gather). */
  confidence?: number;
  /** Transport-detected signals that bypass text matching. */
  event?: "voicemail" | "hold" | "silence" | "hangup";
}

export interface RecordResult {
  recordingUri?: string;
  transcript?: string | null;
  confidence?: number;
}

/** The transport port. Implemented by SimulatedSession (tests) and, later, by
 *  Gather-webhook and Media-Streams adapters. */
export interface CallSession {
  nextPrompt(timeoutSec: number): Promise<PromptObservation>;
  sendDigits(digits: string): Promise<void>;
  record(maxSec: number): Promise<RecordResult>;
  hangup(): Promise<void>;
}

export interface NavOutcome {
  status: CallStatus;
  transcript: string | null;
  confidence: number;
  recordingUri?: string;
  digitsSent: string[];
  events: string[];
  /** e.g. "voicemail", "retry_exhausted", "menu_changed". */
  reason?: string;
}

export interface NavOptions {
  promptTimeoutSec?: number;
  maxUnknown?: number;
  vars?: CallVars;
}
