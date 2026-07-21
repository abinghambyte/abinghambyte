import type { CallStatus } from "../domain/types.ts";
import type {
  CallOutcome,
  CallVars,
  PlaceCallOpts,
  TelephonyProvider,
} from "./types.ts";

/**
 * What the simulated line "says" for a given facility (and, for personalized
 * lines, a given caller). `menu` is the ordered list of prompts the line
 * actually presents — if it doesn't match the script's expectations, the
 * simulator reports `menu_mismatch`, exactly as a changed real menu would.
 */
export interface SimReading {
  menu: string[];
  transcript: string | null;
  sttConfidence: number;
  /** Override to simulate a line that never gets to a result (busy, etc.). */
  callStatus?: CallStatus;
}

/** Resolves a reading from (facilityId, caller vars). */
export type SimWorld = (facilityId: string, vars: CallVars) => SimReading;

function substitute(digits: string, vars: CallVars): string {
  return digits
    .replace(/\{\{user\.testingId\}\}/g, vars.testingId ?? "")
    .replace(/\{\{user\.lastNameFirst3Dtmf\}\}/g, vars.lastNameFirst3Dtmf ?? "");
}

/**
 * A faithful, deterministic telephony provider for development and tests. It
 * walks the IvrScript, sends DTMF (with per-user substitution), detects menu
 * mismatches, and returns the scripted result recording — all with no network
 * and no cost.
 */
export function createSimulator(world: SimWorld): TelephonyProvider {
  return {
    async placeCall(opts: PlaceCallOpts): Promise<CallOutcome> {
      const { script } = opts;
      const vars = opts.vars ?? {};
      const reading = world(script.facilityId, vars);
      const events: string[] = [`dial ${script.phone}`];
      const digitsSent: string[] = [];

      if (reading.callStatus && reading.callStatus !== "completed") {
        events.push(`line ${reading.callStatus}`);
        return { callStatus: reading.callStatus, transcript: null, sttConfidence: 0, digitsSent, events };
      }

      let menuIdx = 0;
      const nextPrompt = (): string | undefined => reading.menu[menuIdx];

      for (const step of script.steps) {
        if ("wait" in step) {
          const got = nextPrompt();
          if (got !== step.expect) {
            events.push(`expected prompt "${step.expect}" but line said "${got ?? "<end>"}" → menu_mismatch`);
            return { callStatus: "menu_mismatch", transcript: null, sttConfidence: 0, digitsSent, events };
          }
          events.push(`heard prompt "${got}"`);
          menuIdx++;
        } else if ("sendDigits" in step) {
          const d = substitute(step.sendDigits, vars);
          digitsSent.push(d);
          events.push(`sent digits "${d}"`);
        } else {
          const got = nextPrompt();
          if (got !== step.record.expect) {
            events.push(`expected "${step.record.expect}" to record but line said "${got ?? "<end>"}" → menu_mismatch`);
            return { callStatus: "menu_mismatch", transcript: null, sttConfidence: 0, digitsSent, events };
          }
          const desc = reading.transcript === null ? "no audio" : `conf ${reading.sttConfidence.toFixed(2)}`;
          events.push(`recording "${step.record.expect}" (${desc})`);
          return { callStatus: "completed", transcript: reading.transcript, sttConfidence: reading.sttConfidence, digitsSent, events };
        }
      }

      events.push("script ended without a record step → failed");
      return { callStatus: "failed", transcript: null, sttConfidence: 0, digitsSent, events };
    },
  };
}
