import test from "node:test";
import assert from "node:assert/strict";
import {
  createTwilioProvider,
  type TwilioCallStatus,
  type TwilioRecording,
  type TwilioVoiceClient,
} from "./twilio.ts";
import type { TranscriptionProvider } from "../transcription/types.ts";
import type { IvrScript } from "./types.ts";
import { interpret } from "../domain/interpret.ts";
import type { ResultGrammar } from "../domain/types.ts";

const script: IvrScript = {
  facilityId: "fac_sentry_b",
  version: 4,
  phone: "+1-970-295-4766",
  steps: [
    { wait: "prompt", expect: "language", timeoutSec: 20 },
    { sendDigits: "1" },
    { wait: "prompt", expect: "id", timeoutSec: 15 },
    { sendDigits: "{{user.testingId}}#" },
    { record: { start: "afterPrompt", expect: "result", maxSec: 30 } },
  ],
};

function fakeClient(cfg: { status: TwilioCallStatus; recordings?: TwilioRecording[] }): TwilioVoiceClient {
  return {
    async createCall() {
      return { sid: "CA_test" };
    },
    async getCall() {
      return { status: cfg.status };
    },
    async listRecordings() {
      return cfg.recordings ?? [];
    },
  };
}

const fakeStt = (transcript: string | null, confidence: number): TranscriptionProvider => ({
  async transcribe() {
    return { transcript, confidence };
  },
});

const baseOpts = { from: "+15550000000", pollIntervalMs: 0, sleep: async () => {} };

test("completed call → transcribes recording and reports digits sent", async () => {
  const provider = createTwilioProvider(
    fakeClient({ status: "completed", recordings: [{ uri: "rec://1", duration: 12 }] }),
    { ...baseOpts, transcription: fakeStt("you are not required to test today", 0.96) },
  );
  const out = await provider.placeCall({ script, vars: { testingId: "1001" } });

  assert.equal(out.callStatus, "completed");
  assert.equal(out.transcript, "you are not required to test today");
  assert.equal(out.sttConfidence, 0.96);
  assert.equal(out.recordingUri, "rec://1");
  assert.ok(out.digitsSent.includes("1001#"));
});

test("the transcribed outcome flows into interpret() → CLEAR", () => {
  const grammar: ResultGrammar = { clearPhrases: ["not required"], testPhrases: ["you are required"] };
  const r = interpret({
    kind: "sentry",
    callStatus: "completed",
    transcript: "you are not required to test today",
    sttConfidence: 0.96,
    grammar,
  });
  assert.equal(r.status, "CLEAR");
});

for (const [status, expected] of [
  ["busy", "busy"],
  ["no-answer", "no_answer"],
  ["failed", "failed"],
  ["canceled", "failed"],
] as const) {
  test(`${status} call → ${expected}, no transcript`, async () => {
    const provider = createTwilioProvider(fakeClient({ status }), baseOpts);
    const out = await provider.placeCall({ script, vars: { testingId: "1001" } });
    assert.equal(out.callStatus, expected);
    assert.equal(out.transcript, null);
  });
}

test("completed without a transcription provider → recording kept, transcript null (safe)", async () => {
  const provider = createTwilioProvider(
    fakeClient({ status: "completed", recordings: [{ uri: "rec://2", duration: 9 }] }),
    baseOpts,
  );
  const out = await provider.placeCall({ script, vars: { testingId: "1001" } });
  assert.equal(out.callStatus, "completed");
  assert.equal(out.transcript, null);
  assert.equal(out.recordingUri, "rec://2");
  // transcript null → interpret would return AMBIGUOUS ("verify yourself").
});

test("completed but no recording → transcript null (safe)", async () => {
  const provider = createTwilioProvider(fakeClient({ status: "completed", recordings: [] }), baseOpts);
  const out = await provider.placeCall({ script, vars: { testingId: "1001" } });
  assert.equal(out.callStatus, "completed");
  assert.equal(out.transcript, null);
});
