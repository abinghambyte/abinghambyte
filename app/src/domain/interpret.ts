import type { ClearResult, InterpretInput } from "./types.ts";

/**
 * The single most important safety constant: we only ever say CLEAR when
 * speech-to-text confidence meets this high bar. Any doubt does NOT become
 * "you're clear" — it becomes MUST_TEST or AMBIGUOUS.
 */
export const CLEAR_MIN_CONFIDENCE = 0.9;

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Case-insensitive substring match for multi-word phrases. Returns the hit. */
function matchPhrase(text: string, phrases: string[]): string | null {
  for (const p of phrases) {
    if (p && text.includes(norm(p))) return p;
  }
  return null;
}

/** Whole-word match, so "red" does not match inside "hundred". */
function hasWord(text: string, word: string): boolean {
  const w = norm(word);
  if (!w) return false;
  const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z])${escaped}(?:$|[^a-z])`).test(text);
}

/**
 * Interpret one line reading into a ClearResult, applying asymmetric safety
 * thresholds. Pure function (no I/O) so it is exhaustively unit-testable.
 *
 * Invariants (enforced in interpret.test.ts):
 *   1. status "CLEAR" is only ever returned when confidence >= CLEAR_MIN_CONFIDENCE.
 *   2. Any test signal, or any uncertainty, resolves to MUST_TEST or AMBIGUOUS —
 *      never CLEAR. (No false CLEAR.)
 */
export function interpret(input: InterpretInput): ClearResult {
  const { kind, callStatus, transcript, sttConfidence, grammar } = input;

  // 1. The call did not complete -> we learned nothing. Fail safe: verify.
  if (callStatus !== "completed") {
    return { status: "UNREACHABLE", reason: `call ${callStatus}` };
  }

  // 2. No usable audio / transcription -> verify.
  if (transcript === null || transcript.trim() === "") {
    return { status: "AMBIGUOUS", reason: "no transcript", transcript };
  }

  const text = norm(transcript);
  const testHit = matchPhrase(text, grammar.testPhrases);
  const clearHit = matchPhrase(text, grammar.clearPhrases);

  if (kind === "sentry") {
    // A personalized line directly states whether THIS person must test.
    if (testHit && !clearHit) {
      return { status: "MUST_TEST", confidence: sttConfidence, evidence: `matched "${testHit}"` };
    }
    if (clearHit && !testHit) {
      if (sttConfidence >= CLEAR_MIN_CONFIDENCE) {
        return { status: "CLEAR", confidence: sttConfidence, evidence: `matched "${clearHit}"` };
      }
      return {
        status: "AMBIGUOUS",
        reason: `heard "clear" but confidence ${sttConfidence.toFixed(2)} < ${CLEAR_MIN_CONFIDENCE}`,
        transcript,
      };
    }
    // Both phrases, or neither -> we cannot be sure.
    return {
      status: "AMBIGUOUS",
      reason: clearHit && testHit ? "conflicting phrases" : "no matching phrase",
      transcript,
    };
  }

  // color_code: a recording lists the colors that must test today.
  // An explicit "all colors / everyone" phrase means MUST_TEST for everyone.
  if (testHit) {
    return { status: "MUST_TEST", confidence: sttConfidence, evidence: `matched "${testHit}"` };
  }

  const colorWords = grammar.colors ?? [];
  const announced = colorWords.filter((c) => hasWord(text, c));
  const userColor = input.userColor ? norm(input.userColor) : null;

  if (!userColor) {
    // Can't resolve a color line without knowing the person's color.
    return { status: "AMBIGUOUS", reason: "no assigned color for user", transcript };
  }

  if (announced.some((c) => norm(c) === userColor)) {
    return { status: "MUST_TEST", confidence: sttConfidence, evidence: `color "${userColor}" announced` };
  }

  // The user's color was NOT heard. Only say CLEAR if we're confident we
  // captured the full announcement — a single dropped word could hide it.
  if (announced.length > 0 && sttConfidence >= CLEAR_MIN_CONFIDENCE) {
    return {
      status: "CLEAR",
      confidence: sttConfidence,
      evidence: `announced [${announced.join(", ")}] does not include "${userColor}"`,
    };
  }

  return {
    status: "AMBIGUOUS",
    reason:
      announced.length === 0
        ? "no colors recognized in recording"
        : `confidence ${sttConfidence.toFixed(2)} too low to trust a clear reading`,
    transcript,
  };
}
