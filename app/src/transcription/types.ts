/**
 * The transcription seam. Real telephony produces audio; this turns a recording
 * into text + a calibrated confidence. The Whisper adapter lands in M3 (see
 * docs/DEV-ROADMAP.md); until then `nullTranscription` yields no text, which
 * makes the real-call path resolve safely to AMBIGUOUS ("verify yourself").
 */
export interface TranscriptResult {
  transcript: string | null;
  /** 0..1. The safety model only ever says CLEAR at high confidence. */
  confidence: number;
}

export interface TranscriptionProvider {
  transcribe(recordingUri: string): Promise<TranscriptResult>;
}
