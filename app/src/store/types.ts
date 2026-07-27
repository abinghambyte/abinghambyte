import type { AuditRecord } from "../audit/types.ts";
import type { Consent } from "../consent/ledger.ts";
import type { EnrolledUser, Facility } from "../worker/check.ts";

export interface StoredUser {
  id: string;
  name: string;
  phone: string; // encrypted at rest by the store
  consent: Consent;
}

export interface EnrollmentInput {
  userId: string;
  facilityId: string;
  color?: string | null;
  vars?: { testingId?: string; lastNameFirst3Dtmf?: string };
}

export interface NotificationRecord {
  userId: string;
  facilityId: string;
  day: string;
  channel: string;
  status: "sent" | "suppressed";
  reason?: string;
  headline: string;
  at: string;
}

/**
 * Persistence port. The in-memory implementation (memory.ts) is used for the
 * demo, CI, and tests; a Postgres implementation is the production swap-in
 * behind the same interface (see docs/DEV-ROADMAP.md M1). PII is encrypted by
 * the store on write and decrypted only when building the call payload.
 */
export interface Store {
  addFacility(f: Facility): void;
  addUser(u: StoredUser): void;
  enroll(e: EnrollmentInput): void;

  facilities(): Facility[];
  /** Enrolled users for a facility, with decrypted call vars. */
  usersForFacility(facilityId: string): EnrolledUser[];
  /** Public user fields (never phone/PII). */
  getUser(userId: string): { id: string; name: string } | undefined;
  userConsent(userId: string): Consent | undefined;

  saveAudit(a: AuditRecord): void;
  auditsForUser(userId: string): AuditRecord[];
  saveNotification(n: NotificationRecord): void;
  notifications(): NotificationRecord[];

  markRan(facilityId: string, day: string): void;
  hasRan(facilityId: string, day: string): boolean;
}
