import type { ClearResult } from "../domain/types.ts";

/**
 * The proof locker: a court-showable record of every check-in. Each entry is
 * derived from an immutable AuditRecord and linked into an HMAC hash chain, so
 * altering any entry (or reordering them) breaks the chain — the export can
 * state "integrity verified" and a tamper is detectable.
 */

export type Decision = ClearResult["status"];

export interface ProofEntry {
  day: string;
  at: string;
  facility: string;
  decision: Decision;
  detail: string; // the evidence/reason, in plain language
  heardExcerpt: string | null; // what the line said (truncated)
  digitsSent: number; // count only — never expose the ID digits in the record
  hasRecording: boolean;
  prevHash: string;
  hash: string;
}

export interface ProofSummary {
  checkIns: number; // total attempts recorded
  confirmed: number; // definitive readings (clear or must-test)
  clear: number;
  mustTest: number;
  verifyYourself: number; // ambiguous + unreachable
}

export interface ProofExport {
  serviceName: string;
  userId: string;
  userName: string;
  generatedAt: string;
  range: { from: string; to: string };
  summary: ProofSummary;
  entries: ProofEntry[];
  /** Final chain hash — the integrity token. */
  digest: string;
  /** Whether this export re-verifies against its signing key. */
  integrityVerified: boolean;
}
