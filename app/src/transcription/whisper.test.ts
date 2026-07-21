import test from "node:test";
import assert from "node:assert/strict";
import {
  acousticConfidence,
  createWhisperTranscription,
  httpWhisperEngine,
  mapWhisperResponse,
  type AsrEngine,
  type AsrResult,
} from "./whisper.ts";
import { interpret } from "../domain/interpret.ts";
import type { ResultGrammar } from "../domain/types.ts";

const words = (...ps: number[]): AsrResult["words"] => ps.map((p, i) => ({ word: `w${i}`, probability: p }));

// --- acousticConfidence -----------------------------------------------------

test("all high-probability words → high confidence", () => {
  assert.ok(acousticConfidence({ text: "a b c d", words: words(0.95, 0.96, 0.94, 0.97) }) >= 0.9);
});

test("one badly-heard word pulls confidence below the CLEAR bar", () => {
  const c = acousticConfidence({ text: "a b c d", words: words(0.2, 0.95, 0.96, 0.97) });
  assert.ok(c < 0.9, `expected < 0.9, got ${c}`);
});

test("empty / no words → 0", () => {
  assert.equal(acousticConfidence({ text: "", words: [] }), 0);
});

test("high no_speech_prob caps confidence low", () => {
  const c = acousticConfidence({ text: "a b", words: words(0.95, 0.96), noSpeechProb: 0.7 });
  assert.ok(c <= 0.3);
});

test("hallucination signal (high compression ratio) caps confidence", () => {
  const c = acousticConfidence({ text: "a b", words: words(0.95, 0.96), compressionRatio: 3.0 });
  assert.ok(c <= 0.4);
});

test("very negative avg logprob caps confidence", () => {
  const c = acousticConfidence({ text: "a b", words: words(0.95, 0.96), avgLogprob: -1.5 });
  assert.ok(c <= 0.4);
});

// --- provider + interpret integration --------------------------------------

const grammar: ResultGrammar = { clearPhrases: ["not required"], testPhrases: ["you are required"] };

function fakeEngine(result: AsrResult): AsrEngine {
  return { async transcribe() { return result; } };
}

test("clean 'not required' decode → CLEAR through interpret", async () => {
  const provider = createWhisperTranscription(
    fakeEngine({ text: "you are not required to test today", words: words(0.95, 0.96, 0.97, 0.95, 0.96, 0.97, 0.95), noSpeechProb: 0.02 }),
  );
  const t = await provider.transcribe("rec://clean");
  const r = interpret({ kind: "sentry", callStatus: "completed", transcript: t.transcript, sttConfidence: t.confidence, grammar });
  assert.equal(r.status, "CLEAR");
});

test("noisy 'not required' decode → AMBIGUOUS (verify yourself), never CLEAR", async () => {
  const provider = createWhisperTranscription(
    fakeEngine({ text: "you are not required to test today", words: words(0.4, 0.5, 0.95, 0.6, 0.95, 0.9, 0.5), avgLogprob: -1.3 }),
  );
  const t = await provider.transcribe("rec://noisy");
  const r = interpret({ kind: "sentry", callStatus: "completed", transcript: t.transcript, sttConfidence: t.confidence, grammar });
  assert.equal(r.status, "AMBIGUOUS");
});

test("silence (no speech) → null transcript → AMBIGUOUS", async () => {
  const provider = createWhisperTranscription(fakeEngine({ text: "", words: [], noSpeechProb: 0.95 }));
  const t = await provider.transcribe("rec://silence");
  assert.equal(t.transcript, null);
});

// --- faster-whisper JSON mapping -------------------------------------------

test("maps faster-whisper JSON (words, quality signals)", () => {
  const asr = mapWhisperResponse({
    text: "you are required to report today",
    language_probability: 0.99,
    segments: [
      {
        avg_logprob: -0.3,
        no_speech_prob: 0.01,
        compression_ratio: 1.4,
        words: [
          { word: "you", probability: 0.98 },
          { word: "are", probability: 0.97 },
          { word: "required", probability: 0.9 },
        ],
      },
    ],
  });
  assert.equal(asr.words.length, 3);
  assert.equal(asr.noSpeechProb, 0.01);
  assert.equal(asr.avgLogprob, -0.3);
  assert.ok(acousticConfidence(asr) >= 0.9);
});

test("httpWhisperEngine posts to the endpoint and maps the response", async () => {
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ text: "no test", segments: [{ no_speech_prob: 0.02, words: [{ word: "no", probability: 0.95 }, { word: "test", probability: 0.93 }] }] }), {
      status: 200,
    })) as unknown as typeof fetch;
  const engine = httpWhisperEngine({ endpoint: "http://whisper.local/asr", fetchImpl: fakeFetch });
  const asr = await engine.transcribe("rec://x");
  assert.equal(asr.text, "no test");
  assert.equal(asr.words.length, 2);
});
