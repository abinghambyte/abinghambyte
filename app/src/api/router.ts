import { randomUUID } from "node:crypto";
import { interpret } from "../domain/interpret.ts";
import type { ResultGrammar } from "../domain/types.ts";
import { navToCallOutcome } from "../nav/engine.ts";
import type { WebhookNavigator, NavSessionStore } from "../nav/webhook.ts";
import type { NavFlow, PromptObservation } from "../nav/types.ts";
import { planNotice } from "../notify/plan.ts";
import { canNotify, type Consent } from "../consent/ledger.ts";
import { localDay } from "../schedule/scheduler.ts";
import type { AuditRecord } from "../audit/types.ts";
import type { Store } from "../store/types.ts";
import type { Facility } from "../worker/check.ts";
import { buildProof } from "../proof/build.ts";
import { renderProofHtml } from "../proof/html.ts";

export interface ApiDeps {
  store: Store;
  sessions: NavSessionStore;
  nav: WebhookNavigator;
  flowFor: (facilityId: string) => NavFlow | undefined;
  now: () => Date;
  baseUrl: string;
  serviceName: string;
  /** Secret used to sign the proof-locker hash chain. */
  proofSigningKey: string;
}

export interface ApiRequest {
  method: string;
  path: string;
  body: string;
  query?: Record<string, string>;
}
export interface ApiResponse {
  status: number;
  contentType: string;
  body: string;
}

const json = (status: number, obj: unknown): ApiResponse => ({ status, contentType: "application/json", body: JSON.stringify(obj) });
const xml = (body: string): ApiResponse => ({ status: 200, contentType: "text/xml", body });

function parseForm(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of body.split("&")) {
    if (!pair) continue;
    const [k, v = ""] = pair.split("=");
    out[decodeURIComponent(k.replace(/\+/g, " "))] = decodeURIComponent(v.replace(/\+/g, " "));
  }
  return out;
}

export function createApi(deps: ApiDeps): { handle(req: ApiRequest): ApiResponse } {
  const { store, sessions, nav, flowFor, now, baseUrl, serviceName, proofSigningKey } = deps;
  const callCtx = new Map<string, { userId: string; facilityId: string }>();

  const facility = (id: string): Facility | undefined => store.facilities().find((f) => f.id === id);
  const grammarOf = (id: string): ResultGrammar | undefined => facility(id)?.grammar;

  function recordCompletion(callSid: string, outcome: ReturnType<typeof navToCallOutcome> | undefined): void {
    const ctx = callCtx.get(callSid);
    if (!ctx || !outcome) return;
    const f = facility(ctx.facilityId);
    const grammar = grammarOf(ctx.facilityId);
    if (!f || !grammar) return;

    const nowD = now();
    const result = interpret({
      kind: f.kind,
      callStatus: outcome.callStatus,
      transcript: outcome.transcript,
      sttConfidence: outcome.sttConfidence,
      grammar,
    });
    const day = localDay(nowD, f.timezone);
    const audit: AuditRecord = {
      facilityId: f.id,
      scriptVersion: flowFor(f.id)?.version ?? 0,
      day,
      userId: ctx.userId,
      callStatus: outcome.callStatus,
      transcript: outcome.transcript,
      sttConfidence: outcome.sttConfidence,
      result,
      digitsSent: outcome.digitsSent,
      recordingUri: outcome.recordingUri ?? null,
      at: nowD.toISOString(),
    };
    store.saveAudit(audit);

    const consent: Consent | undefined = store.userConsent(ctx.userId);
    const notice = planNotice({ id: ctx.userId, name: ctx.userId }, result);
    for (const channel of notice.channelPlan) {
      const gate = consent ? canNotify(consent, channel, nowD) : { ok: false, reason: "no_consent_record" };
      store.saveNotification({
        userId: ctx.userId,
        facilityId: f.id,
        day,
        channel,
        status: gate.ok ? "sent" : "suppressed",
        reason: gate.ok ? undefined : gate.reason,
        headline: notice.headline,
        at: nowD.toISOString(),
      });
    }
    callCtx.delete(callSid);
  }

  function handle(req: ApiRequest): ApiResponse {
    const { method, path } = req;

    if (method === "GET" && path === "/healthz") return json(200, { ok: true });

    if (method === "POST" && path === "/enroll") {
      let b: Record<string, unknown>;
      try {
        b = JSON.parse(req.body || "{}");
      } catch {
        return json(400, { error: "invalid JSON" });
      }
      const userId = String(b.userId ?? `u_${randomUUID().slice(0, 8)}`);
      const facilityId = String(b.facilityId ?? "");
      if (!facility(facilityId)) return json(404, { error: "unknown facility" });
      store.addUser({
        id: userId,
        name: String(b.name ?? userId),
        phone: String(b.phone ?? ""),
        consent: {
          userId,
          smsConsent: b.smsConsent !== false,
          voiceConsent: b.voiceConsent !== false,
          optedOut: false,
        },
      });
      store.enroll({
        userId,
        facilityId,
        color: b.color ? String(b.color) : null,
        vars: { testingId: b.testingId ? String(b.testingId) : undefined, lastNameFirst3Dtmf: b.lastNameFirst3Dtmf ? String(b.lastNameFirst3Dtmf) : undefined },
      });
      return json(201, { userId, facilityId });
    }

    const statusMatch = path.match(/^\/users\/([^/]+)\/status$/);
    if (method === "GET" && statusMatch) {
      const audits = store.auditsForUser(decodeURIComponent(statusMatch[1]));
      if (audits.length === 0) return json(404, { error: "no readings yet" });
      const latest = audits[audits.length - 1];
      return json(200, { day: latest.day, status: latest.result.status, at: latest.at });
    }

    const histMatch = path.match(/^\/users\/([^/]+)\/history$/);
    if (method === "GET" && histMatch) {
      const audits = store.auditsForUser(decodeURIComponent(histMatch[1]));
      return json(200, audits.map((a) => ({ day: a.day, status: a.result.status, at: a.at, recordingUri: a.recordingUri ?? null })));
    }

    const proofMatch = path.match(/^\/users\/([^/]+)\/proof$/);
    if (method === "GET" && proofMatch) {
      const userId = decodeURIComponent(proofMatch[1]);
      const audits = store.auditsForUser(userId);
      const user = store.getUser(userId);
      const exp = buildProof(audits, { serviceName, userId, userName: user?.name ?? userId, generatedAt: now().toISOString() }, proofSigningKey);
      if (req.query?.format === "json") return json(200, exp);
      return { status: 200, contentType: "text/html", body: renderProofHtml(exp) };
    }

    if (method === "POST" && path === "/calls/start") {
      let b: Record<string, unknown>;
      try {
        b = JSON.parse(req.body || "{}");
      } catch {
        return json(400, { error: "invalid JSON" });
      }
      const callSid = String(b.callSid ?? "");
      const facilityId = String(b.facilityId ?? "");
      const userId = String(b.userId ?? "");
      const flow = flowFor(facilityId);
      if (!callSid || !flow) return json(400, { error: "callSid and a known facility flow required" });
      const users = store.usersForFacility(facilityId);
      const user = users.find((u) => u.id === userId);
      sessions.start(callSid, flow, user?.vars ?? {});
      callCtx.set(callSid, { userId, facilityId });
      return json(201, { callSid, voiceUrl: `${baseUrl}/twilio/voice/${callSid}` });
    }

    const voiceMatch = path.match(/^\/twilio\/voice\/([^/]+)$/);
    if (method === "POST" && voiceMatch) {
      const callSid = decodeURIComponent(voiceMatch[1]);
      const form = parseForm(req.body);
      const actionUrl = `${baseUrl}/twilio/voice/${callSid}`;

      // Answering-machine detection from Twilio.
      if ((form.AnsweredBy ?? "").startsWith("machine")) {
        const step = nav.onObservation(callSid, { text: null, event: "voicemail" }, actionUrl);
        recordCompletion(callSid, step.outcome ? navToCallOutcome(step.outcome) : undefined);
        return xml(step.twiml);
      }

      // Initial connect: no SpeechResult field present at all → start listening.
      if (!("SpeechResult" in form)) {
        return xml(nav.onCallStart(callSid, actionUrl).twiml);
      }

      const obs: PromptObservation = {
        text: form.SpeechResult ? form.SpeechResult : null,
        confidence: form.Confidence ? Number(form.Confidence) : undefined,
        event: form.SpeechResult ? undefined : "silence",
      };
      const step = nav.onObservation(callSid, obs, actionUrl);
      if (step.done) recordCompletion(callSid, step.outcome ? navToCallOutcome(step.outcome) : undefined);
      return xml(step.twiml);
    }

    return json(404, { error: "not found" });
  }

  return { handle };
}
