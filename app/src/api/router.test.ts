import test from "node:test";
import assert from "node:assert/strict";
import { createApi, type ApiRequest } from "./router.ts";
import { createMemoryStore } from "../store/memory.ts";
import { aesGcmEncryptor, devKeyFromPassphrase } from "../crypto/field.ts";
import { createMemoryNavSessions, createWebhookNavigator } from "../nav/webhook.ts";
import { sentryFlow, PROMPTS } from "../nav/fixtures.ts";
import { facilities as demoFacilities } from "../demo/fixtures.ts";
import type { Facility } from "../worker/check.ts";

function makeApi() {
  const store = createMemoryStore(aesGcmEncryptor(devKeyFromPassphrase("router-test")));
  const sentry = demoFacilities.find((f) => f.id === "fac_sentry_b") as Facility;
  store.addFacility({ ...sentry, resultsAfter: "00:00", timezone: "America/Denver" });
  const sessions = createMemoryNavSessions();
  const nav = createWebhookNavigator(sessions);
  const api = createApi({
    store,
    sessions,
    nav,
    flowFor: (id) => (id === "fac_sentry_b" ? sentryFlow : undefined),
    now: () => new Date("2026-07-21T23:30:00Z"),
    baseUrl: "http://svc.test",
    serviceName: "Clearline",
    proofSigningKey: "router-test-proof-key",
  });
  return { api, store };
}

const req = (method: string, path: string, body = "", query?: Record<string, string>): ApiRequest => ({ method, path, body, query });
const form = (o: Record<string, string>): string => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");

test("health check", () => {
  assert.equal(makeApi().api.handle(req("GET", "/healthz")).status, 200);
});

test("enroll → unknown facility is rejected", () => {
  const { api } = makeApi();
  const r = api.handle(req("POST", "/enroll", JSON.stringify({ name: "X", facilityId: "nope" })));
  assert.equal(r.status, 404);
});

test("full flow: enroll → start call → Twilio webhooks → status reflects the decision", () => {
  const { api } = makeApi();

  const enroll = JSON.parse(
    api.handle(req("POST", "/enroll", JSON.stringify({ userId: "u_sam", name: "Sam", phone: "+19705550000", facilityId: "fac_sentry_b", testingId: "1001", lastNameFirst3Dtmf: "336" }))).body,
  );
  assert.equal(enroll.userId, "u_sam");

  const start = JSON.parse(api.handle(req("POST", "/calls/start", JSON.stringify({ callSid: "CA9", facilityId: "fac_sentry_b", userId: "u_sam" }))).body);
  assert.equal(start.callSid, "CA9");

  // Initial connect (no SpeechResult) → a Gather to start listening.
  const connect = api.handle(req("POST", "/twilio/voice/CA9", ""));
  assert.equal(connect.contentType, "text/xml");
  assert.match(connect.body, /<Gather input="speech"/);

  // Feed the IVR's spoken prompts as successive webhooks.
  const prompts = [PROMPTS.language, PROMPTS.enterId, PROMPTS.enterName];
  for (const p of prompts) {
    const r = api.handle(req("POST", "/twilio/voice/CA9", form({ SpeechResult: p.text ?? "", Confidence: "0.9" })));
    assert.match(r.body, /<Gather input="speech"|<Play digits=/);
  }
  // The result prompt (high confidence) → completes the call.
  const done = api.handle(req("POST", "/twilio/voice/CA9", form({ SpeechResult: "you are not required to test today", Confidence: "0.95" })));
  assert.match(done.body, /<Hangup\/>/);

  // The webhook persisted the decision; status now reflects CLEAR.
  const status = JSON.parse(api.handle(req("GET", "/users/u_sam/status")).body);
  assert.equal(status.status, "CLEAR");

  const history = JSON.parse(api.handle(req("GET", "/users/u_sam/history")).body);
  assert.equal(history.length, 1);

  // Proof locker: HTML by default, JSON on request.
  const proofHtml = api.handle(req("GET", "/users/u_sam/proof"));
  assert.equal(proofHtml.contentType, "text/html");
  assert.match(proofHtml.body, /Compliance Record/);
  const proofJson = JSON.parse(api.handle(req("GET", "/users/u_sam/proof", "", { format: "json" })).body);
  assert.equal(proofJson.integrityVerified, true);
  assert.equal(proofJson.summary.clear, 1);
});

test("status 404 before any reading", () => {
  const { api } = makeApi();
  api.handle(req("POST", "/enroll", JSON.stringify({ userId: "u_new", name: "New", facilityId: "fac_sentry_b" })));
  assert.equal(api.handle(req("GET", "/users/u_new/status")).status, 404);
});

test("machine detection → voicemail path, verify-yourself decision persisted", () => {
  const { api } = makeApi();
  api.handle(req("POST", "/enroll", JSON.stringify({ userId: "u_vm", name: "VM", facilityId: "fac_sentry_b", testingId: "1001" })));
  api.handle(req("POST", "/calls/start", JSON.stringify({ callSid: "CAvm", facilityId: "fac_sentry_b", userId: "u_vm" })));
  const r = api.handle(req("POST", "/twilio/voice/CAvm", form({ AnsweredBy: "machine_start" })));
  assert.match(r.body, /<Hangup\/>/);
  const status = JSON.parse(api.handle(req("GET", "/users/u_vm/status")).body);
  assert.equal(status.status, "UNREACHABLE");
});
