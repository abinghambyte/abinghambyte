import { writeFileSync } from "node:fs";
import { buildProof, verifyProof } from "../proof/build.ts";
import { renderProofHtml } from "../proof/html.ts";
import type { AuditRecord } from "../audit/types.ts";
import type { ClearResult } from "../domain/types.ts";

/**
 * Generate a sample proof-locker document from a few weeks of check-ins.
 *
 *   node --experimental-strip-types src/demo/run-proof.ts [outfile.html]
 */

const KEY = "demo-proof-signing-key";

function audit(day: string, result: ClearResult, transcript: string | null): AuditRecord {
  return {
    facilityId: "fac_sentry_b", scriptVersion: 4, day, userId: "u_sam",
    callStatus: result.status === "UNREACHABLE" ? "no_answer" : "completed",
    transcript, sttConfidence: 0.95, result, digitsSent: ["1", "1001#", "336"],
    recordingUri: result.status === "CLEAR" || result.status === "MUST_TEST" ? `rec://sam/${day}` : null,
    at: `${day}T23:32:00.000Z`,
  };
}

const clear = (d: string): AuditRecord => audit(d, { status: "CLEAR", confidence: 0.96, evidence: "not required" }, "you are not required to test today");
const test = (d: string): AuditRecord => audit(d, { status: "MUST_TEST", confidence: 0.95, evidence: 'matched "you are required"' }, "you are required to report today");
const verify = (d: string): AuditRecord => audit(d, { status: "AMBIGUOUS", reason: "confidence 0.61 < 0.90" }, "you are ... required ... today");
const unreach = (d: string): AuditRecord => audit(d, { status: "UNREACHABLE", reason: "line busy" }, null);

const audits: AuditRecord[] = [
  clear("2026-07-06"), clear("2026-07-07"), test("2026-07-08"), clear("2026-07-09"),
  clear("2026-07-10"), verify("2026-07-11"), clear("2026-07-12"), clear("2026-07-13"),
  test("2026-07-14"), clear("2026-07-15"), unreach("2026-07-16"), clear("2026-07-17"),
  clear("2026-07-18"), test("2026-07-19"), clear("2026-07-20"),
];

const exp = buildProof(audits, { serviceName: "Clearline", userId: "u_sam", userName: "Sam Rivera", generatedAt: "2026-07-21T15:00:00.000Z" }, KEY);
const outfile = process.argv[2] ?? "proof-sample.html";
writeFileSync(outfile, renderProofHtml(exp, { sample: true }));

console.log(`\n  Proof locker sample for ${exp.userName}`);
console.log(`  Period ${exp.range.from} → ${exp.range.to}`);
console.log(`  ${exp.summary.checkIns} check-ins · ${exp.summary.confirmed} confirmed · ${exp.summary.mustTest} test days · ${exp.summary.verifyYourself} advised-to-call`);
console.log(`  Integrity digest: ${exp.digest.slice(0, 24)}…  (re-verify: ${verifyProof(exp, KEY) ? "✓" : "✗"})`);
console.log(`  Wrote ${outfile}\n`);
