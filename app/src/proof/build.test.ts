import test from "node:test";
import assert from "node:assert/strict";
import { buildProof, verifyProof } from "./build.ts";
import { renderProofHtml } from "./html.ts";
import type { AuditRecord } from "../audit/types.ts";
import type { ClearResult } from "../domain/types.ts";

const KEY = "test-signing-key";
const opts = { serviceName: "Clearline", userId: "u_sam", userName: "Sam", generatedAt: "2026-07-22T18:00:00.000Z" };

function audit(day: string, result: ClearResult, transcript: string | null = null): AuditRecord {
  return {
    facilityId: "fac_x", scriptVersion: 1, day, userId: "u_sam",
    callStatus: "completed", transcript, sttConfidence: 0.95, result,
    digitsSent: ["1", "1001#"], recordingUri: null, at: `${day}T23:30:00.000Z`,
  };
}

const audits: AuditRecord[] = [
  audit("2026-07-18", { status: "CLEAR", confidence: 0.95, evidence: "green not announced" }, "blue and orange report"),
  audit("2026-07-19", { status: "MUST_TEST", confidence: 0.96, evidence: 'color "green" announced' }, "green report today"),
  audit("2026-07-20", { status: "AMBIGUOUS", reason: "low confidence" }, "you are ... today"),
  audit("2026-07-21", { status: "UNREACHABLE", reason: "call busy" }),
];

test("summary counts decisions correctly", () => {
  const p = buildProof(audits, opts, KEY);
  assert.equal(p.summary.checkIns, 4);
  assert.equal(p.summary.clear, 1);
  assert.equal(p.summary.mustTest, 1);
  assert.equal(p.summary.verifyYourself, 2);
  assert.equal(p.summary.confirmed, 2);
});

test("the export verifies against its key", () => {
  const p = buildProof(audits, opts, KEY);
  assert.equal(verifyProof(p, KEY), true);
});

test("tampering with an entry breaks the chain", () => {
  const p = buildProof(audits, opts, KEY);
  p.entries[1].decision = "CLEAR"; // flip a "must test" to "clear"
  assert.equal(verifyProof(p, KEY), false);
});

test("reordering entries breaks the chain", () => {
  const p = buildProof(audits, opts, KEY);
  [p.entries[0], p.entries[1]] = [p.entries[1], p.entries[0]];
  assert.equal(verifyProof(p, KEY), false);
});

test("a different key does not verify", () => {
  const p = buildProof(audits, opts, KEY);
  assert.equal(verifyProof(p, "other-key"), false);
});

test("the record never exposes the ID digits (count only)", () => {
  const p = buildProof(audits, opts, KEY);
  assert.equal(p.entries[0].digitsSent, 2); // a number, not "1001#"
  const html = renderProofHtml(p);
  assert.doesNotMatch(html, /1001#/);
});

test("HTML export contains the key court-facing facts", () => {
  const html = renderProofHtml(buildProof(audits, opts, KEY), { sample: true });
  assert.match(html, /Check-in Compliance Record/);
  assert.match(html, /Sam/);
  assert.match(html, /Test required/);
  assert.match(html, /verified ✓/);
  assert.match(html, /SAMPLE/);
});
