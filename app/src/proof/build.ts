import { createHmac } from "node:crypto";
import type { AuditRecord } from "../audit/types.ts";
import type { ClearResult } from "../domain/types.ts";
import type { Decision, ProofEntry, ProofExport, ProofSummary } from "./types.ts";

const GENESIS = "GENESIS";

function hmacHex(key: string, payload: string): string {
  return createHmac("sha256", key).update(payload).digest("hex");
}

function plainDetail(result: ClearResult): string {
  switch (result.status) {
    case "MUST_TEST":
      return `Required to test — ${result.evidence}`;
    case "CLEAR":
      return `Not required to test — ${result.evidence}`;
    case "AMBIGUOUS":
      return `Could not confirm (${result.reason}); advised to call the line`;
    case "UNREACHABLE":
      return `Line unreachable (${result.reason}); advised to call the line`;
  }
}

function truncate(s: string | null, n = 140): string | null {
  if (s === null) return null;
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Canonical string for a single entry's hash (stable field order). */
function canonical(e: Omit<ProofEntry, "hash">): string {
  return JSON.stringify([e.prevHash, e.day, e.at, e.facility, e.decision, e.detail, e.heardExcerpt, e.digitsSent, e.hasRecording]);
}

export interface BuildProofOpts {
  serviceName: string;
  userId: string;
  userName: string;
  generatedAt: string;
}

/**
 * Build a signed, chained proof export from a user's audit records. Pure
 * (timestamps are passed in). `signingKey` is a server-held secret; production
 * would additionally use an external timestamping authority / asymmetric
 * signature so a third party can verify without the key.
 */
export function buildProof(audits: AuditRecord[], opts: BuildProofOpts, signingKey: string): ProofExport {
  const sorted = [...audits].sort((a, b) => a.at.localeCompare(b.at));

  const entries: ProofEntry[] = [];
  let prevHash = GENESIS;
  const summary: ProofSummary = { checkIns: 0, confirmed: 0, clear: 0, mustTest: 0, verifyYourself: 0 };

  for (const a of sorted) {
    const decision: Decision = a.result.status;
    const base = {
      day: a.day,
      at: a.at,
      facility: a.facilityId,
      decision,
      detail: plainDetail(a.result),
      heardExcerpt: truncate(a.transcript),
      digitsSent: a.digitsSent.length,
      hasRecording: Boolean(a.recordingUri),
      prevHash,
    };
    const hash = hmacHex(signingKey, canonical(base));
    entries.push({ ...base, hash });
    prevHash = hash;

    summary.checkIns++;
    if (decision === "CLEAR") { summary.clear++; summary.confirmed++; }
    else if (decision === "MUST_TEST") { summary.mustTest++; summary.confirmed++; }
    else summary.verifyYourself++;
  }

  const exp: ProofExport = {
    serviceName: opts.serviceName,
    userId: opts.userId,
    userName: opts.userName,
    generatedAt: opts.generatedAt,
    range: { from: sorted[0]?.day ?? "—", to: sorted[sorted.length - 1]?.day ?? "—" },
    summary,
    entries,
    digest: prevHash,
    integrityVerified: true,
  };
  return exp;
}

/** Re-verify an export's hash chain against the signing key. Returns false if any
 *  entry was altered, reordered, added, or removed. */
export function verifyProof(exp: ProofExport, signingKey: string): boolean {
  let prevHash = GENESIS;
  for (const e of exp.entries) {
    if (e.prevHash !== prevHash) return false;
    const expected = hmacHex(signingKey, canonical({
      day: e.day, at: e.at, facility: e.facility, decision: e.decision,
      detail: e.detail, heardExcerpt: e.heardExcerpt, digitsSent: e.digitsSent,
      hasRecording: e.hasRecording, prevHash: e.prevHash,
    }));
    if (expected !== e.hash) return false;
    prevHash = e.hash;
  }
  return prevHash === exp.digest;
}
