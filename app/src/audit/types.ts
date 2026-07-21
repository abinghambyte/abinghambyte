import type { CallStatus, ClearResult } from "../domain/types.ts";

/**
 * An immutable record of one reading for one person on one day. This is the
 * court-showable proof: it captures exactly what the line said, what we decided,
 * and which script version produced it — so a later menu change never rewrites
 * history. In production this also references the stored audio recording.
 */
export interface AuditRecord {
  facilityId: string;
  scriptVersion: number;
  day: string;
  userId: string;
  callStatus: CallStatus;
  transcript: string | null;
  sttConfidence: number;
  result: ClearResult;
  digitsSent: string[];
  /** Reference to the stored audio, when a real call produced one. */
  recordingUri?: string | null;
  /** ISO timestamp, passed in by the caller (kept out of the pure core). */
  at: string;
}
