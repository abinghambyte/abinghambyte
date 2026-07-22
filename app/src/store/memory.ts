import type { Encryptor } from "../crypto/field.ts";
import type { AuditRecord } from "../audit/types.ts";
import type { Consent } from "../consent/ledger.ts";
import type { EnrolledUser, Facility } from "../worker/check.ts";
import type { EnrollmentInput, NotificationRecord, Store, StoredUser } from "./types.ts";

interface StoredEnrollment {
  userId: string;
  facilityId: string;
  color?: string | null;
  encTestingId?: string;
  encName?: string;
}

interface StoredUserRow {
  id: string;
  name: string;
  encPhone: string;
  consent: Consent;
}

/**
 * In-memory Store. PII (testing ID, name letters, phone) is encrypted with the
 * injected Encryptor on write, so nothing sensitive sits in the maps in the
 * clear — the same discipline a Postgres adapter must follow at rest.
 */
export function createMemoryStore(enc: Encryptor): Store {
  const facilities = new Map<string, Facility>();
  const users = new Map<string, StoredUserRow>();
  const enrollments: StoredEnrollment[] = [];
  const audits: AuditRecord[] = [];
  const notifications: NotificationRecord[] = [];
  const ranDays = new Set<string>();

  return {
    addFacility(f) {
      facilities.set(f.id, f);
    },
    addUser(u: StoredUser) {
      users.set(u.id, { id: u.id, name: u.name, encPhone: enc.encrypt(u.phone), consent: u.consent });
    },
    enroll(e: EnrollmentInput) {
      enrollments.push({
        userId: e.userId,
        facilityId: e.facilityId,
        color: e.color ?? null,
        encTestingId: e.vars?.testingId ? enc.encrypt(e.vars.testingId) : undefined,
        encName: e.vars?.lastNameFirst3Dtmf ? enc.encrypt(e.vars.lastNameFirst3Dtmf) : undefined,
      });
    },

    facilities() {
      return [...facilities.values()];
    },
    usersForFacility(facilityId): EnrolledUser[] {
      return enrollments
        .filter((e) => e.facilityId === facilityId)
        .map((e) => {
          const u = users.get(e.userId);
          const eu: EnrolledUser = {
            id: e.userId,
            name: u?.name ?? e.userId,
            color: e.color,
            vars: {
              testingId: e.encTestingId ? enc.decrypt(e.encTestingId) : undefined,
              lastNameFirst3Dtmf: e.encName ? enc.decrypt(e.encName) : undefined,
            },
          };
          return eu;
        });
    },
    userConsent(userId) {
      return users.get(userId)?.consent;
    },

    saveAudit(a) {
      audits.push(a);
    },
    auditsForUser(userId) {
      return audits.filter((a) => a.userId === userId);
    },
    saveNotification(n) {
      notifications.push(n);
    },
    notifications() {
      return [...notifications];
    },

    markRan(facilityId, day) {
      ranDays.add(`${facilityId}:${day}`);
    },
    hasRan(facilityId, day) {
      return ranDays.has(`${facilityId}:${day}`);
    },
  };
}
