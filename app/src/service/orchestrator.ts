import type { TelephonyProvider } from "../telephony/types.ts";
import { runFacilityCheck } from "../worker/check.ts";
import { canNotify } from "../consent/ledger.ts";
import { localDay, localHHMM } from "../schedule/scheduler.ts";
import type { Store } from "../store/types.ts";

export interface TickResult {
  ranFacilities: string[];
  skippedAlreadyRan: string[];
  notYetDue: string[];
  audits: number;
  notificationsSent: number;
  notificationsSuppressed: number;
}

/**
 * One service tick: for every facility that is due in its own timezone and has
 * not run for its local day, place the check(s), persist the audit records, and
 * record a notification per channel — each gated by TCPA consent. Idempotent:
 * a facility runs at most once per local day.
 */
export async function runServiceTick(opts: { now: Date; store: Store; provider: TelephonyProvider }): Promise<TickResult> {
  const { now, store, provider } = opts;
  const nowIso = now.toISOString();
  const result: TickResult = {
    ranFacilities: [],
    skippedAlreadyRan: [],
    notYetDue: [],
    audits: 0,
    notificationsSent: 0,
    notificationsSuppressed: 0,
  };

  for (const facility of store.facilities()) {
    const day = localDay(now, facility.timezone);
    const after = facility.resultsAfter ?? "00:00";

    if (store.hasRan(facility.id, day)) {
      result.skippedAlreadyRan.push(facility.id);
      continue;
    }
    if (localHHMM(now, facility.timezone) < after) {
      result.notYetDue.push(facility.id);
      continue;
    }

    const users = store.usersForFacility(facility.id);
    const { userOutcomes } = await runFacilityCheck(facility, users, provider, day, nowIso);

    for (const uo of userOutcomes) {
      store.saveAudit(uo.audit);
      result.audits++;

      const consent = store.userConsent(uo.user.id);
      for (const channel of uo.notice.channelPlan) {
        const gate = consent ? canNotify(consent, channel, now) : { ok: false, reason: "no_consent_record" };
        store.saveNotification({
          userId: uo.user.id,
          facilityId: facility.id,
          day,
          channel,
          status: gate.ok ? "sent" : "suppressed",
          reason: gate.ok ? undefined : gate.reason,
          headline: uo.notice.headline,
          at: nowIso,
        });
        if (gate.ok) result.notificationsSent++;
        else result.notificationsSuppressed++;
      }
    }

    store.markRan(facility.id, day);
    result.ranFacilities.push(facility.id);
  }

  return result;
}
