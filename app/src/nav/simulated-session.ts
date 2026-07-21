import type { CallSession, PromptObservation, RecordResult } from "./types.ts";

export interface SimSessionScript {
  /** Prompts emitted in order, one per nextPrompt() call. When exhausted,
   *  silence is returned (so a mis-authored flow fails safe rather than hanging). */
  prompts: PromptObservation[];
  /** What record() returns (the captured result). */
  onRecord?: RecordResult;
}

export interface SimulatedSession {
  session: CallSession;
  /** Digits sent during the call, in order (for assertions). */
  sent: string[];
  hungUp: () => boolean;
}

/**
 * A scriptable CallSession for testing and demos — reproduces any failure mode
 * (retry loops, voicemail, changed menu, dead air) deterministically, with no
 * telephony.
 */
export function createSimulatedSession(script: SimSessionScript): SimulatedSession {
  let i = 0;
  let hungUp = false;
  const sent: string[] = [];

  const session: CallSession = {
    async nextPrompt(): Promise<PromptObservation> {
      return script.prompts[i++] ?? { text: null, event: "silence" };
    },
    async sendDigits(digits: string): Promise<void> {
      sent.push(digits);
    },
    async record(): Promise<RecordResult> {
      return script.onRecord ?? { transcript: null, confidence: 0 };
    },
    async hangup(): Promise<void> {
      hungUp = true;
    },
  };

  return { session, sent, hungUp: () => hungUp };
}
