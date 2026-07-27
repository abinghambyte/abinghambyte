import type { TranscriptionProvider, TranscriptResult } from "./types.ts";

/**
 * Whisper transcription (M3).
 *
 * The actual ASR runs behind the `AsrEngine` port so this module's real work —
 * deriving a trustworthy confidence for our safety model — is pure and testable
 * with no model, no audio, and no network. `httpWhisperEngine()` is a reference
 * client for a self-hosted faster-whisper HTTP service.
 *
 * Confidence philosophy: we compute a CONSERVATIVE acoustic confidence from the
 * per-word probabilities and Whisper's own quality signals (no_speech,
 * compression ratio, avg logprob). It intentionally errs low — a single
 * badly-heard word pulls it down — because in this domain an over-cautious
 * "verify yourself" is safe and a false "you're clear" is not. (A later,
 * grammar-aware refinement can narrow this to the decision-bearing words to cut
 * unnecessary verify-noise; that's a precision gain, not a safety one.)
 */

export interface AsrWord {
  word: string;
  probability: number; // 0..1
}

export interface AsrResult {
  text: string;
  words: AsrWord[];
  /** Whisper quality signals (worst-case aggregated across segments). */
  noSpeechProb?: number; // high → probably silence/noise
  compressionRatio?: number; // high (>~2.4) → probable hallucination/repetition
  avgLogprob?: number; // very negative (<~-1.0) → low-quality decode
  languageProbability?: number;
}

export interface AsrEngine {
  transcribe(recordingUri: string): Promise<AsrResult>;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Derive a conservative 0..1 confidence from an ASR result. Pure and exported so
 * the calibration is unit-tested directly.
 */
export function acousticConfidence(asr: AsrResult): number {
  const words = asr.words ?? [];
  if (words.length === 0 || asr.text.trim() === "") return 0;

  // Base: mean probability of the weakest quartile of words (the "weakest link",
  // but robust to a single outlier).
  const probs = words.map((w) => clamp01(w.probability)).sort((a, b) => a - b);
  const k = Math.max(1, Math.ceil(probs.length * 0.25));
  const weakest = probs.slice(0, k);
  let c = weakest.reduce((s, p) => s + p, 0) / weakest.length;

  // Quality gates: cap confidence when Whisper's own signals look bad.
  if (asr.noSpeechProb !== undefined && asr.noSpeechProb > 0.5) c = Math.min(c, 0.3);
  if (asr.compressionRatio !== undefined && asr.compressionRatio > 2.4) c = Math.min(c, 0.4);
  if (asr.avgLogprob !== undefined && asr.avgLogprob < -1.0) c = Math.min(c, 0.4);

  return round2(clamp01(c));
}

/** Wrap an ASR engine as a TranscriptionProvider for the rest of the system. */
export function createWhisperTranscription(engine: AsrEngine): TranscriptionProvider {
  return {
    async transcribe(recordingUri: string): Promise<TranscriptResult> {
      const asr = await engine.transcribe(recordingUri);
      const text = asr.text.trim();
      // No usable speech → no transcript (interpret() → AMBIGUOUS).
      if (text === "" || (asr.noSpeechProb !== undefined && asr.noSpeechProb > 0.8)) {
        return { transcript: null, confidence: 0 };
      }
      return { transcript: asr.text, confidence: acousticConfidence(asr) };
    },
  };
}

// --- Reference engine for a self-hosted faster-whisper HTTP service ----------

interface WhisperWordJson {
  word?: string;
  probability?: number;
}
interface WhisperSegmentJson {
  avg_logprob?: number;
  no_speech_prob?: number;
  compression_ratio?: number;
  words?: WhisperWordJson[];
}
interface WhisperResponseJson {
  text?: string;
  segments?: WhisperSegmentJson[];
  language_probability?: number;
}

/** Map a faster-whisper JSON response into our AsrResult. Pure and exported. */
export function mapWhisperResponse(json: WhisperResponseJson): AsrResult {
  const segments = json.segments ?? [];
  const words: AsrWord[] = [];
  let noSpeech = 0;
  let compression = 0;
  let logprobSum = 0;
  let logprobCount = 0;

  for (const seg of segments) {
    for (const w of seg.words ?? []) {
      words.push({ word: (w.word ?? "").trim(), probability: clamp01(w.probability ?? 0) });
    }
    if (seg.no_speech_prob !== undefined) noSpeech = Math.max(noSpeech, seg.no_speech_prob);
    if (seg.compression_ratio !== undefined) compression = Math.max(compression, seg.compression_ratio);
    if (seg.avg_logprob !== undefined) {
      logprobSum += seg.avg_logprob;
      logprobCount++;
    }
  }

  return {
    text: json.text ?? words.map((w) => w.word).join(" "),
    words,
    noSpeechProb: segments.length ? noSpeech : undefined,
    compressionRatio: segments.length ? compression : undefined,
    avgLogprob: logprobCount ? logprobSum / logprobCount : undefined,
    languageProbability: json.language_probability,
  };
}

export interface HttpWhisperOptions {
  /** URL of a faster-whisper HTTP endpoint accepting {audio_url, word_timestamps}. */
  endpoint: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export function httpWhisperEngine(opts: HttpWhisperOptions): AsrEngine {
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    async transcribe(recordingUri: string): Promise<AsrResult> {
      const res = await doFetch(opts.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audio_url: recordingUri, word_timestamps: true }),
      });
      if (!res.ok) throw new Error(`whisper service returned ${res.status}`);
      return mapWhisperResponse((await res.json()) as WhisperResponseJson);
    },
  };
}
