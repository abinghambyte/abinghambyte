import type { TranscriptionProvider } from "./types.ts";

/**
 * A placeholder that transcribes nothing — real STT (Whisper) lands in M3.
 * With this in place, a completed real call yields transcript=null, which
 * `interpret()` resolves to AMBIGUOUS → the user is told to verify themselves.
 * Safe by construction until transcription is real.
 */
export const nullTranscription: TranscriptionProvider = {
  async transcribe(): Promise<{ transcript: null; confidence: number }> {
    return { transcript: null, confidence: 0 };
  },
};
