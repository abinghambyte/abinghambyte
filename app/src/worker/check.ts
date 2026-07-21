import type { ClearResult, FacilityKind, ResultGrammar } from "../domain/types.ts";
import { interpret } from "../domain/interpret.ts";
import type { CallVars, IvrScript, CallOutcome, TelephonyProvider } from "../telephony/types.ts";
import type { AuditRecord } from "../audit/types.ts";
import { planNotice, type UserNotice } from "../notify/plan.ts";

export interface Facility {
  id: string;
  name: string;
  kind: FacilityKind;
  timezone: string;
  script: IvrScript;
  grammar: ResultGrammar;
}

export interface EnrolledUser {
  id: string;
  name: string;
  /** Assigned color, for color_code facilities. */
  color?: string | null;
  /** Per-user call variables (testing ID, name letters) for sentry lines. */
  vars?: CallVars;
}

export interface UserOutcome {
  user: EnrolledUser;
  outcome: CallOutcome;
  result: ClearResult;
  notice: UserNotice;
  audit: AuditRecord;
}

export interface FacilityCheckResult {
  facility: Facility;
  /** For color lines, the single shared call; for sentry, undefined (per-user). */
  sharedOutcome?: CallOutcome;
  userOutcomes: UserOutcome[];
}

/**
 * Run one day's check for a facility across all its enrolled users.
 *
 * - color_code: ONE shared call serves everyone (the recording lists the colors).
 * - sentry: each person enters their own ID, so one call per user.
 */
export async function runFacilityCheck(
  facility: Facility,
  users: EnrolledUser[],
  provider: TelephonyProvider,
  day: string,
  now: string,
): Promise<FacilityCheckResult> {
  const userOutcomes: UserOutcome[] = [];

  if (facility.kind === "color_code") {
    const shared = await provider.placeCall({ script: facility.script });
    for (const user of users) {
      const result = interpret({
        kind: "color_code",
        callStatus: shared.callStatus,
        transcript: shared.transcript,
        sttConfidence: shared.sttConfidence,
        grammar: facility.grammar,
        userColor: user.color ?? null,
      });
      userOutcomes.push(buildOutcome(facility, user, shared, result, day, now));
    }
    return { facility, sharedOutcome: shared, userOutcomes };
  }

  for (const user of users) {
    const outcome = await provider.placeCall({ script: facility.script, vars: user.vars });
    const result = interpret({
      kind: "sentry",
      callStatus: outcome.callStatus,
      transcript: outcome.transcript,
      sttConfidence: outcome.sttConfidence,
      grammar: facility.grammar,
    });
    userOutcomes.push(buildOutcome(facility, user, outcome, result, day, now));
  }
  return { facility, userOutcomes };
}

function buildOutcome(
  facility: Facility,
  user: EnrolledUser,
  outcome: CallOutcome,
  result: ClearResult,
  day: string,
  now: string,
): UserOutcome {
  const audit: AuditRecord = {
    facilityId: facility.id,
    scriptVersion: facility.script.version,
    day,
    userId: user.id,
    callStatus: outcome.callStatus,
    transcript: outcome.transcript,
    sttConfidence: outcome.sttConfidence,
    result,
    digitsSent: outcome.digitsSent,
    recordingUri: outcome.recordingUri ?? null,
    at: now,
  };
  return { user, outcome, result, notice: planNotice(user, result), audit };
}
