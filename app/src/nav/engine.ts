import type { CallStatus } from "../domain/types.ts";
import type { CallOutcome } from "../telephony/types.ts";
import type { CallVars } from "../telephony/types.ts";
import { recognizeIntent } from "./intent.ts";
import type { CallSession, NavAction, NavFlow, NavOptions, NavOutcome } from "./types.ts";

function substitute(s: string, vars: CallVars): string {
  return s
    .replace(/\{\{user\.testingId\}\}/g, vars.testingId ?? "")
    .replace(/\{\{user\.lastNameFirst3Dtmf\}\}/g, vars.lastNameFirst3Dtmf ?? "");
}

/**
 * Drive a call through an IVR using a NavFlow policy and a CallSession transport.
 *
 * Guarantees (enforced by the guards below and tested in engine.test.ts):
 *  - never hangs: bounded by maxTurns, per-state maxVisits, and unknown-streak
 *  - always fails safe: any unhandled situation → a non-"completed" status that
 *    interpret() renders as UNREACHABLE/AMBIGUOUS → "verify yourself"
 */
export async function runNavigation(flow: NavFlow, session: CallSession, opts: NavOptions = {}): Promise<NavOutcome> {
  const vars = opts.vars ?? {};
  const events: string[] = [];
  const digitsSent: string[] = [];
  const visits: Record<string, number> = {};
  const maxTurns = flow.maxTurns ?? 30;
  const maxUnknown = opts.maxUnknown ?? 3;
  const promptTimeout = opts.promptTimeoutSec ?? 12;
  let unknownStreak = 0;
  let stateId = flow.start;

  const flag = async (reason: string, status: CallStatus): Promise<NavOutcome> => {
    events.push(`FLAG: ${reason} → ${status}`);
    await session.hangup();
    return { status, transcript: null, confidence: 0, digitsSent, events, reason };
  };

  for (let turn = 0; turn < maxTurns; turn++) {
    const state = flow.states[stateId];
    if (!state) return flag(`unknown state "${stateId}"`, "failed");

    visits[stateId] = (visits[stateId] ?? 0) + 1;
    if (state.maxVisits && visits[stateId] > state.maxVisits) {
      return flag(`state "${stateId}" exceeded maxVisits (${state.maxVisits})`, "failed");
    }

    const obs = await session.nextPrompt(promptTimeout);
    const intent = recognizeIntent(obs, flow.intents);
    events.push(`[${stateId}] ${obs.event ? `event:${obs.event}` : `"${obs.text ?? ""}"`} → ${intent}`);

    // Global: an answering machine is never our result.
    if (intent === "voicemail") {
      await session.hangup();
      events.push("voicemail → no_answer");
      return { status: "no_answer", transcript: null, confidence: 0, digitsSent, events, reason: "voicemail" };
    }

    const branch = state.on.find((b) => b.intent === intent);
    let action: NavAction;
    let next: string | undefined;

    if (branch) {
      action = branch.action;
      next = branch.next;
      unknownStreak = 0;
    } else if (state.default) {
      action = state.default.action;
      next = state.default.next;
      if (intent === "unknown" || intent === "hold") {
        unknownStreak++;
        if (unknownStreak >= maxUnknown) return flag(`${unknownStreak} unrecognized prompts`, "menu_mismatch");
      } else {
        unknownStreak = 0;
      }
    } else {
      // No transition and no default.
      if (intent === "unknown" || intent === "hold") {
        unknownStreak++;
        if (unknownStreak >= maxUnknown) return flag(`${unknownStreak} unrecognized prompts`, "menu_mismatch");
        continue; // observe again
      }
      return flag(`no transition for intent "${intent}" in "${stateId}"`, "menu_mismatch");
    }

    switch (action.type) {
      case "sendDigits": {
        const d = substitute(action.digits, vars);
        digitsSent.push(d);
        await session.sendDigits(d);
        events.push(`sent "${d}"`);
        break;
      }
      case "wait":
        events.push("wait");
        break;
      case "record": {
        const rec = await session.record(action.maxSec);
        await session.hangup();
        events.push(`recorded result${rec.recordingUri ? ` (${rec.recordingUri})` : ""}`);
        return {
          status: "completed",
          transcript: rec.transcript ?? null,
          confidence: rec.confidence ?? 0,
          recordingUri: rec.recordingUri,
          digitsSent,
          events,
        };
      }
      case "hangup":
        await session.hangup();
        events.push("hangup");
        return { status: "failed", transcript: null, confidence: 0, digitsSent, events, reason: "flow_hangup" };
      case "flag":
        return flag(action.reason, "menu_mismatch");
    }

    if (next) stateId = next;
  }

  return flag(`exceeded ${maxTurns} turns`, "failed");
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
