import type { CallVars } from "../telephony/types.ts";
import { advance, completeResult, initProgress, type NavProgress } from "./engine.ts";
import { gatherResponse, hangupResponse } from "./twiml-response.ts";
import type { NavFlow, NavOptions, NavOutcome, PromptObservation } from "./types.ts";

/**
 * The Gather-webhook transport. A call is step-driven: each Twilio webhook brings
 * one observation, we `advance` the state machine once, and reply with TwiML.
 * Per-call progress is persisted (keyed by CallSid) across HTTP requests.
 *
 * Uses the SAME pure engine as the loop driver — so its behavior is identical to
 * the simulator and is tested by replaying an observation sequence.
 */

export interface NavSession {
  flow: NavFlow;
  vars: CallVars;
  progress: NavProgress;
}

export interface NavSessionStore {
  start(callSid: string, flow: NavFlow, vars: CallVars): void;
  get(callSid: string): NavSession | undefined;
  save(callSid: string, s: NavSession): void;
  end(callSid: string): void;
}

export function createMemoryNavSessions(): NavSessionStore {
  const m = new Map<string, NavSession>();
  return {
    start(callSid, flow, vars) {
      m.set(callSid, { flow, vars, progress: initProgress(flow) });
    },
    get: (callSid) => m.get(callSid),
    save: (callSid, s) => void m.set(callSid, s),
    end: (callSid) => void m.delete(callSid),
  };
}

export interface WebhookStep {
  twiml: string;
  done: boolean;
  outcome?: NavOutcome;
}

export interface WebhookNavigator {
  /** Response for the initial call-connect webhook (no speech yet): start listening. */
  onCallStart(callSid: string, actionUrl: string): WebhookStep;
  /** Response for each subsequent Gather webhook carrying the line's speech. */
  onObservation(callSid: string, obs: PromptObservation, actionUrl: string): WebhookStep;
}

export function createWebhookNavigator(sessions: NavSessionStore, opts: NavOptions = {}): WebhookNavigator {
  return {
    onCallStart(_callSid, actionUrl): WebhookStep {
      // Nothing observed yet — just listen for the first prompt.
      return { twiml: gatherResponse({ type: "listen" }, actionUrl), done: false };
    },

    onObservation(callSid, obs, actionUrl): WebhookStep {
      const session = sessions.get(callSid);
      if (!session) {
        // Unknown call — fail safe.
        return { twiml: hangupResponse(), done: true };
      }

      const command = advance(session.flow, session.progress, obs, { ...opts, vars: session.vars });

      if (command.type === "record") {
        // With Gather-speech, the result prompt IS this observation — use it directly.
        const outcome = completeResult(session.progress, { transcript: obs.text, confidence: obs.confidence ?? 0 });
        sessions.end(callSid);
        return { twiml: hangupResponse(), done: true, outcome };
      }

      if (command.type === "done") {
        sessions.end(callSid);
        return { twiml: hangupResponse(), done: true, outcome: session.progress.outcome };
      }

      sessions.save(callSid, session);
      return { twiml: gatherResponse(command, actionUrl), done: false };
    },
  };
}
