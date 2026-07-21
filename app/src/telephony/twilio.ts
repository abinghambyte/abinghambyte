import type { CallStatus } from "../domain/types.ts";
import type { TranscriptionProvider } from "../transcription/types.ts";
import type { CallOutcome, PlaceCallOpts, TelephonyProvider } from "./types.ts";
import { compileToTwiml } from "./twiml.ts";

/**
 * Twilio Programmable Voice adapter for the anchor job: place an outbound call,
 * navigate the IVR with DTMF, and capture the result recording.
 *
 * The Twilio REST surface is behind the small `TwilioVoiceClient` port so the
 * adapter's logic is testable with a fake — no account, no network, no real
 * calls. `realTwilioClient()` provides the production implementation (lazy-loads
 * the optional `twilio` package).
 */

export type TwilioCallStatus =
  | "queued"
  | "initiated"
  | "ringing"
  | "in-progress"
  | "completed"
  | "busy"
  | "no-answer"
  | "failed"
  | "canceled";

export interface TwilioRecording {
  uri: string;
  duration: number;
}

export interface TwilioVoiceClient {
  createCall(opts: { to: string; from: string; twiml: string; record: boolean }): Promise<{ sid: string }>;
  getCall(sid: string): Promise<{ status: TwilioCallStatus }>;
  listRecordings(callSid: string): Promise<TwilioRecording[]>;
}

export interface TwilioProviderOptions {
  /** Our outbound caller ID (an E.164 number owned in the Twilio account). */
  from: string;
  promptPauseSec?: number;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  /** Optional: fill transcript+confidence from the recording (M3). */
  transcription?: TranscriptionProvider;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const TERMINAL: Record<string, CallStatus | undefined> = {
  completed: "completed",
  busy: "busy",
  "no-answer": "no_answer",
  failed: "failed",
  canceled: "failed",
};

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function createTwilioProvider(client: TwilioVoiceClient, options: TwilioProviderOptions): TelephonyProvider {
  const pollIntervalMs = options.pollIntervalMs ?? 3000;
  const maxPollAttempts = options.maxPollAttempts ?? 40;
  const sleep = options.sleep ?? defaultSleep;

  return {
    async placeCall(opts: PlaceCallOpts): Promise<CallOutcome> {
      const { script } = opts;
      const vars = opts.vars ?? {};
      const events: string[] = [];
      const { twiml, digits } = compileToTwiml(script, vars, { promptPauseSec: options.promptPauseSec });

      const { sid } = await client.createCall({ to: script.phone, from: options.from, twiml, record: true });
      events.push(`created call ${sid} to ${script.phone}`);

      // Poll to a terminal call state.
      let terminal: CallStatus | undefined;
      let last: TwilioCallStatus = "queued";
      for (let i = 0; i < maxPollAttempts; i++) {
        const { status } = await client.getCall(sid);
        last = status;
        terminal = TERMINAL[status];
        if (terminal) break;
        await sleep(pollIntervalMs);
      }

      if (!terminal) {
        events.push(`no terminal state after ${maxPollAttempts} polls (last "${last}") → failed`);
        return { callStatus: "failed", transcript: null, sttConfidence: 0, digitsSent: digits, events };
      }
      events.push(`call ${last} → ${terminal}`);

      if (terminal !== "completed") {
        return { callStatus: terminal, transcript: null, sttConfidence: 0, digitsSent: digits, events };
      }

      const recordings = await client.listRecordings(sid);
      if (recordings.length === 0) {
        events.push("completed but no recording available");
        return { callStatus: "completed", transcript: null, sttConfidence: 0, digitsSent: digits, events };
      }
      const rec = recordings[0];
      events.push(`recording ${rec.uri} (${rec.duration}s)`);

      let transcript: string | null = null;
      let sttConfidence = 0;
      if (options.transcription) {
        const t = await options.transcription.transcribe(rec.uri);
        transcript = t.transcript;
        sttConfidence = t.confidence;
        events.push(transcript === null ? "transcription: no result" : `transcribed (conf ${sttConfidence.toFixed(2)})`);
      } else {
        events.push("no transcription provider — recording left for the transcription step");
      }

      return {
        callStatus: "completed",
        transcript,
        sttConfidence,
        digitsSent: digits,
        recordingUri: rec.uri,
        recordingDurationSec: rec.duration,
        events,
      };
    },
  };
}

/**
 * Production client. `twilio` is an OPTIONAL dependency — needed only for real
 * calls, never for the simulator, the demo, or tests. Install with `npm i twilio`.
 */
export async function realTwilioClient(accountSid: string, authToken: string): Promise<TwilioVoiceClient> {
  const mod: { default: (sid: string, token: string) => any } = await import("twilio");
  const client = mod.default(accountSid, authToken);
  return {
    async createCall(o) {
      const c = await client.calls.create({ to: o.to, from: o.from, twiml: o.twiml, record: o.record });
      return { sid: c.sid };
    },
    async getCall(sid) {
      const c = await client.calls(sid).fetch();
      return { status: c.status as TwilioCallStatus };
    },
    async listRecordings(callSid) {
      const rs = await client.recordings.list({ callSid, limit: 5 });
      return rs.map((r: { uri: string; duration: string | number }) => ({
        uri: `https://api.twilio.com${String(r.uri).replace(/\.json$/, "")}.mp3`,
        duration: Number(r.duration ?? 0),
      }));
    },
  };
}
