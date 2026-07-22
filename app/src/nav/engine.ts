import type { CallStatus } from "../domain/types.ts";
import type { CallOutcome, CallVars } from "../telephony/types.ts";
import { recognizeIntent } from "./intent.ts";
import type { CallSession, NavFlow, NavOptions, NavOutcome } from "./types.ts";

/**
 * The navigation engine is a PURE STEP REDUCER (`advance`) plus two drivers:
 *  - `runNavigation` calls it in a loop over a CallSession (simulator / Media Streams)
 *  - the webhook transport (nav/webhook.ts) calls it once per HTTP request
 *
 * Same policy, same guarantees, both transports. Guarantees (tested):
 *  - never hangs: bounded by maxTurns, per-state maxVisits, unknown-streak
 *  - always fails safe: any unhandled situation → a non-"completed" status
 */

/** Mutable per-call progress through a NavFlow. */
export interface NavProgress {
  stateId: string;
  visits: Record<string, number>;
  unknownStreak: number;
  turns: number;
  digitsSent: string[];
  events: string[];
  done: boolean;
  outcome?: NavOutcome;
}

/** What the transport should do next, produced by one `advance` step. */
export type NavCommand =
  | { type: "play"; digits: string } // send DTMF, then observe again
  | { type: "listen" } // observe again without acting
  | { type: "record"; maxSec: number } // capture the result → transport finalizes
  | { type: "done" }; // terminal; progress.outcome is set

export function initProgress(flow: NavFlow): NavProgress {
  return { stateId: flow.start, visits: {}, unknownStreak: 0, turns: 0, digitsSent: [], events: [], done: false };
}

function substitute(s: string, vars: CallVars): string {
  return s
    .replace(/\{\{user\.testingId\}\}/g, vars.testingId ?? "")
    .replace(/\{\{user\.lastNameFirst3Dtmf\}\}/g, vars.lastNameFirst3Dtmf ?? "");
}

/**
 * Advance the state machine by one observation. Pure w.r.t. I/O — it mutates
 * `progress` and returns the command the transport must perform. Never throws;
 * every dead end sets a safe terminal outcome.
 */
export function advance(flow: NavFlow, p: NavProgress, obs: { text: string | null; event?: string }, opts: NavOptions = {}): NavCommand {
  const vars = opts.vars ?? {};
  const maxTurns = flow.maxTurns ?? 30;
  const maxUnknown = opts.maxUnknown ?? 3;

  const finish = (status: CallStatus, reason?: string): NavCommand => {
    p.done = true;
    p.outcome = { status, transcript: null, confidence: 0, digitsSent: p.digitsSent, events: p.events, reason };
    return { type: "done" };
  };

  if (p.done) return { type: "done" };

  p.turns++;
  if (p.turns > maxTurns) {
    p.events.push(`FLAG: exceeded ${maxTurns} turns → failed`);
    return finish("failed", "max_turns");
  }

  const state = flow.states[p.stateId];
  if (!state) {
    p.events.push(`FLAG: unknown state "${p.stateId}" → failed`);
    return finish("failed", "unknown_state");
  }

  p.visits[p.stateId] = (p.visits[p.stateId] ?? 0) + 1;
  if (state.maxVisits && p.visits[p.stateId] > state.maxVisits) {
    p.events.push(`FLAG: state "${p.stateId}" exceeded maxVisits (${state.maxVisits}) → failed`);
    return finish("failed", "retry_exhausted");
  }

  const intent = recognizeIntent(obs as { text: string | null; event?: "voicemail" | "hold" | "silence" | "hangup" }, flow.intents);
  p.events.push(`[${p.stateId}] ${obs.event ? `event:${obs.event}` : `"${obs.text ?? ""}"`} → ${intent}`);

  if (intent === "voicemail") {
    p.events.push("voicemail → no_answer");
    return finish("no_answer", "voicemail");
  }

  const branch = state.on.find((b) => b.intent === intent);
  let action;
  let next: string | undefined;

  if (branch) {
    action = branch.action;
    next = branch.next;
    p.unknownStreak = 0;
  } else if (state.default) {
    action = state.default.action;
    next = state.default.next;
    if (intent === "unknown" || intent === "hold") {
      p.unknownStreak++;
      if (p.unknownStreak >= maxUnknown) {
        p.events.push(`FLAG: ${p.unknownStreak} unrecognized prompts → menu_mismatch`);
        return finish("menu_mismatch", "menu_changed");
      }
    } else {
      p.unknownStreak = 0;
    }
  } else {
    if (intent === "unknown" || intent === "hold") {
      p.unknownStreak++;
      if (p.unknownStreak >= maxUnknown) {
        p.events.push(`FLAG: ${p.unknownStreak} unrecognized prompts → menu_mismatch`);
        return finish("menu_mismatch", "menu_changed");
      }
      return { type: "listen" };
    }
    p.events.push(`FLAG: no transition for intent "${intent}" in "${p.stateId}" → menu_mismatch`);
    return finish("menu_mismatch", "no_transition");
  }

  switch (action.type) {
    case "sendDigits": {
      const d = substitute(action.digits, vars);
      p.digitsSent.push(d);
      p.events.push(`sent "${d}"`);
      if (next) p.stateId = next;
      return { type: "play", digits: d };
    }
    case "wait":
      p.events.push("wait");
      if (next) p.stateId = next;
      return { type: "listen" };
    case "record":
      p.events.push("record");
      return { type: "record", maxSec: action.maxSec };
    case "hangup":
      p.events.push("hangup");
      return finish("failed", "flow_hangup");
    case "flag":
      p.events.push(`FLAG: ${action.reason} → menu_mismatch`);
      return finish("menu_mismatch", action.reason);
  }
}

/** Finalize a `record` command with the captured result (from a recording or an
 *  inline ASR observation). Produces the completed outcome. */
export function completeResult(p: NavProgress, result: { transcript?: string | null; confidence?: number; recordingUri?: string }): NavOutcome {
  p.done = true;
  p.outcome = {
    status: "completed",
    transcript: result.transcript ?? null,
    confidence: result.confidence ?? 0,
    recordingUri: result.recordingUri,
    digitsSent: p.digitsSent,
    events: p.events,
  };
  return p.outcome;
}

/** Loop driver over a CallSession (simulator, and later Media Streams). */
export async function runNavigation(flow: NavFlow, session: CallSession, opts: NavOptions = {}): Promise<NavOutcome> {
  const p = initProgress(flow);
  const promptTimeout = opts.promptTimeoutSec ?? 12;

  while (!p.done) {
    const obs = await session.nextPrompt(promptTimeout);
    const command = advance(flow, p, obs, opts);
    if (command.type === "play") {
      await session.sendDigits(command.digits);
      continue;
    }
    if (command.type === "listen") continue;
    if (command.type === "record") {
      const r = await session.record(command.maxSec);
      await session.hangup();
      return completeResult(p, r);
    }
    // done
    await session.hangup();
    return p.outcome as NavOutcome;
  }
  return p.outcome as NavOutcome;
}

/** Adapt a NavOutcome to the CallOutcome the worker consumes. */
export function navToCallOutcome(n: NavOutcome): CallOutcome {
  return {
    callStatus: n.status,
    transcript: n.transcript,
    sttConfidence: n.confidence,
    digitsSent: n.digitsSent,
    recordingUri: n.recordingUri,
    events: n.events,
  };
}
