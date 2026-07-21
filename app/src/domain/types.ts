/**
 * Core domain types for the safety-critical decision.
 *
 * These are deliberately small and pure. The whole system's promise — "never a
 * false CLEAR" — is enforced here, in `interpret()`, and nowhere that does I/O.
 */

/** The kind of testing line a facility uses. */
export type FacilityKind = "color_code" | "sentry";

/** How a call attempt ended, reported by the telephony layer. */
export type CallStatus =
  | "completed" // reached the result and captured audio
  | "busy" // line was busy
  | "no_answer" // rang out
  | "menu_mismatch" // the phone menu did not match our script (line likely changed)
  | "failed"; // provider or other failure

/** Phrases/words used to interpret a result recording for a facility. */
export interface ResultGrammar {
  /** Phrases indicating NO test is required (personalized/"sentry" lines). */
  clearPhrases: string[];
  /** Phrases indicating a test IS required (any line). */
  testPhrases: string[];
  /** For color_code lines: the full set of valid color words to listen for. */
  colors?: string[];
}

/**
 * The safety-critical output of interpreting one line reading for one person.
 *
 * A discriminated union so ambiguous / unreachable states can never be silently
 * collapsed into "CLEAR". Only MUST_TEST and CLEAR are "confident" answers;
 * AMBIGUOUS and UNREACHABLE both mean "we can't be sure — verify it yourself".
 */
export type ClearResult =
  | { status: "MUST_TEST"; confidence: number; evidence: string }
  | { status: "CLEAR"; confidence: number; evidence: string }
  | { status: "AMBIGUOUS"; reason: string; transcript?: string | null }
  | { status: "UNREACHABLE"; reason: string };

/** Everything `interpret()` needs to decide, for one person. */
export interface InterpretInput {
  kind: FacilityKind;
  callStatus: CallStatus;
  /** Transcribed result audio; null when there was no audio / STT failed. */
  transcript: string | null;
  /** Overall speech-to-text confidence, 0..1. */
  sttConfidence: number;
  grammar: ResultGrammar;
  /** The person's assigned color (color_code lines only). */
  userColor?: string | null;
}
