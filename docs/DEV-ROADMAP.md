# Software Development Roadmap

The **engineering** build order for Clearline. Where [ROADMAP.md](ROADMAP.md) is
the product/venture arc, this is how the software actually gets built — milestones
with scope, exit criteria, and a **safety gate** on each. It also captures the
gaps surfaced in review and the decisions still open.

Guiding rule, every milestone: *no path may produce a false "you're clear."*

---

## Where we are

**M0 — Foundations · shipped** ([`app/`](../app/)). The safety-critical core runs
end to end on a simulated line, zero dependencies, 25 passing tests:

- `domain` — `ClearResult` union + `interpret()` with asymmetric thresholds
- `telephony` — provider interface + deterministic simulator (menu-mismatch /
  low-confidence failure paths)
- `notify` — `ClearResult` → channel + escalation plan
- `audit` — immutable court-showable record
- `worker` — per-facility day run (shared call for color, per-user for Sentry)
- `demo` — one day, three facilities, with safety self-checks

Everything below turns this spine into a service that can safely touch a real line
and a real person.

---

## Definition of Ready to pilot (the hard gates)

A live pilot with real people does **not** start until all of these are true.
They are the reason the milestones are ordered the way they are.

- [ ] **Legal sign-off** on auto-dialing, recording, and data handling (CO counsel)
- [ ] **TCPA consent** captured at enrollment; STOP/opt-out honored; quiet hours
- [ ] **A2P 10DLC** brand + campaign registered and approved (weeks of lead time)
- [ ] **Human operator** reviewing every low-confidence reading, daily
- [ ] **Redundant notify path** (two SMS providers) — no last-mile single point of failure
- [ ] **Security review** (at minimum: encryption at rest, access control, secrets, deps)
- [ ] **Automated data retention / deletion** for offboarded users
- [ ] **Facility scripts verified** against the real lines, with health monitoring
- [ ] **Rollback + on-call runbook** written

---

## Milestones

### M1 — Persistence & service shape
Turn the in-memory demo into a real service — still simulator-driven, no real calls.

- Postgres schema + migrations for the [data model](ARCHITECTURE.md#9-data-model-initial)
  (`Organization, User, Facility, Enrollment, CheckJob, AuditRecord, Notification`)
- **Field-level encryption** for PII (testing IDs, name letters, phone numbers)
- HTTP API (Fastify) + auth; enrollment flow **with consent capture** baked in
- Durable job queue (BullMQ/Redis); `CheckJob` scheduler with **IANA timezones**,
  per-facility "results available after" window, retries, idempotency, holiday
  handling, shared-call de-dup for color lines
- Config/secrets management

**Exit:** a running service that schedules and executes simulated checks against a
database, persists audit records, and captures consent. **Safety gate:** the
interpret + fail-safe behavior from M0 is unchanged and still tested in CI.

### M2 — Real telephony (the hard one)
Replace the simulator on real outbound calls.

- [x] **Twilio adapter (static-timing first cut)** — [`twilio.ts`](../app/src/telephony/twilio.ts):
      creates the call, polls to a terminal state, fetches the recording, maps to
      `CallOutcome`; behind a `TwilioVoiceClient` port so it's tested with a fake
      (no account/network). `realTwilioClient()` lazy-loads the optional `twilio` pkg.
- [x] **TwiML compiler** — [`twiml.ts`](../app/src/telephony/twiml.ts): `IvrScript`
      → TwiML (`<Play digits>` with per-user substitution + pauses + call recording).
- [x] **Transcription seam** — [`transcription/`](../app/src/transcription/): interface
      + null stub; a completed real call with no transcript resolves safely to AMBIGUOUS.
- [x] **Navigation engine (the brain)** — [`nav/`](../app/src/nav/): a pure,
      deterministic `NavFlow` state machine (perceive→decide→act) with loop/turn/
      unknown guards that **always fails safe**. Transport-agnostic; tested against a
      scripted `SimulatedSession`. Handles retry loops, voicemail, changed menus,
      dead air. See [IVR-NAVIGATION.md](IVR-NAVIGATION.md). `npm run demo:nav`.
- [x] **Credential-invalid detection** — retry-exhaustion carries a reason distinct
      from menu-changed (so the user can be told "check your ID").
- [ ] **Real-time transport (Gather-webhook first, Media Streams later)** — wire the
      engine to live audio. Gather-webhook needs the M1 API server to hold per-call
      state across webhooks. **The remaining hard part.**
- [ ] Result-segment capture — locate the result within the full recording
- [ ] Operator flow builder/tester — record a call, build/version the `NavFlow`
- [ ] Provisioning: outbound caller ID; begin **A2P 10DLC** registration in parallel

**Exit:** the system navigates a real (test) line and captures the result audio.
**Safety gate:** every unrecognized menu state and every un-transcribed call →
`UNREACHABLE`/`AMBIGUOUS` ("verify yourself"), never CLEAR.

### M3 — Real transcription & calibrated confidence
Make the confidence number trustworthy — the safety model depends on it.

- [x] **Whisper adapter behind an `AsrEngine` port** —
      [`whisper.ts`](../app/src/transcription/whisper.ts): `createWhisperTranscription`
      + `httpWhisperEngine` (reference client for a self-hosted faster-whisper HTTP
      service); tested with a fake engine (no model/audio/network).
- [x] **Conservative confidence calibration** — `acousticConfidence()`: weakest-word-
      quartile gated by Whisper's own signals (no_speech, compression ratio, avg
      logprob). Errs low by design; unit-tested incl. the noisy→AMBIGUOUS path.
- [x] **faster-whisper JSON mapping** — `mapWhisperResponse()`, tested.
- [ ] Tune for 8kHz phone audio; grammar-aware refinement to the decision-bearing
      words (a precision gain — cuts unnecessary verify-noise, not a safety change)
- [ ] Multiple-decode agreement as a second confidence signal
- [ ] **Human-review queue** for low-confidence readings (feeds the operator console)
- [ ] Regression fixtures of realistic (synthetic) recordings, incl. accents/noise

**Exit:** interpret() runs on real transcripts with a calibrated confidence, and
low-confidence cases route to a human. **Safety gate:** measured false-CLEAR rate
on the fixture set is **zero**; ambiguity routes to verify-yourself.

### M4 — Notifications & acknowledgement (production)
The last mile, done to TCPA standard.

- SMS via Twilio **+ a second provider** for redundancy; delivery receipts
- **Opt-out (STOP) + consent ledger**; quiet-hours enforcement
- Automated **voice (TTS)** calls; email; web push
- **Escalation state machine**: primary → await ack → escalate; ack via SMS reply,
  link tap, or answered call; harder escalation for MUST_TEST / verify states
- Optional `SupportContact` escalation (consented)

**Exit:** multi-channel notify with acknowledgement and opt-out, provider-redundant.
**Safety gate:** a MUST_TEST/verify notice that goes un-acked escalates; nothing
is silently dropped.

### M5 — Operator console & observability
The humans watching the safety-critical system need eyes.

- Console: review/resolve low-confidence readings, repair/version scripts,
  per-facility **health** (success rate, confidence distribution, mismatch rate)
- **Alerting** on mismatch-rate spikes (a line likely changed) and job failures
- Logs / metrics / traces; SLOs defined and dashboarded

**Exit:** an operator can run a day, catch a changed menu before the window closes,
and see system health at a glance.

### M6 — Client PWA + proof locker
The first user-facing companion surface.

- **Phone-number OTP login** (many users have no email)
- Daily status view; check-in history; **`ProofExport` PDF** for court/PO
- "I tested ✓" logging → `ProofRecord`
- **Spanish** templates; WCAG accessibility; low-data/offline; installable
- SMS-first parity — every core function works without the app

**Exit:** a user can see their history and download a compliance record; nothing
requires a smartphone.

### M7 — Compliance calendar
Extend beyond the test call.

- `Obligation` types (PO check-ins, court dates, classes, community service, fees)
  through the **same** scheduler + escalation
- Testing-site logistics on MUST_TEST; fee reminders; self-report flow

**Exit:** the product manages the whole supervision calendar, not just the call.

### M8 — Case-manager dashboard & multi-tenancy
The institutional product surface.

- Org isolation + **RBAC**; caseload **early-warning** view (who hasn't acked today)
- Scoped audit access; **reporting/exports** for county audits and grant metrics

**Exit:** a case manager sees their caseload's live status and pulls the outcome
numbers a pilot report / grant needs.

### M9 — Pilot hardening → go live
Meet every "Definition of Ready to pilot" gate.

- Security review / pen test; automated retention & deletion; DR/backup
- Legal sign-off; A2P approved; on-call runbook; load/soak against the simulator

**Exit:** a controlled live pilot with consenting Larimer clients, human operator
watching every reading, weekly metric reporting.

### M10 — Scale
- Self-host packaging (containers + IaC) for security-conscious institutions
- Billing/contracts; "sponsor an account"; grow the facility-script library;
  add line types

---

## Cross-cutting tracks (every milestone)

- **Security & privacy** — encryption at rest/in transit, least-privilege access,
  secrets management, dependency scanning, minimal retention.
- **Compliance** — TCPA (consent/opt-out/quiet hours), A2P 10DLC, recording law
  (CO is one-party consent — *verify with counsel*), CJIS avoidance via the
  self-enroll data boundary, BAA/DPA with partners.
- **Observability** — structured logs, metrics, traces, alerting, per-facility health.
- **Testing/CI** — the false-CLEAR gate runs on every PR; simulator drives
  integration tests; fixture-based STT regression.
- **Docs** — operator runbooks, facility-script authoring guide, incident process.

---

## Decisions still open (with a recommendation)

| Decision | Recommendation | Why it matters |
|---|---|---|
| Entity: PBC vs nonprofit | **PBC** (flexible; keeps grant access) | Gates grant apps + partner comfort |
| Voice-IVR provider (the anchor) | **Twilio** Programmable Voice, behind the interface | Best DTMF/recording/Media-Streams DX for navigating a real IVR — the hardest part |
| Primary notify channel | **SMS** (Twilio), voice as escalation | Works on every phone incl. flip phones; accessibility for this population |
| STT | **Self-host Whisper**, hosted STT fallback | Cost + data control + open-core |
| STT confidence method | keyword-spotting + multi-decode agreement | Raw logprob isn't calibrated |
| Database | **Postgres** (+ field encryption) | Relational, mature, self-hostable |
| User auth | **phone OTP** | Users often have no email |
| Hosting | one cloud target + a self-host reference | Open-core needs both paths |
| SMS 2nd provider | **Telnyx** (or Bandwidth at scale) | Last-mile redundancy |
| WhatsApp | **opt-in secondary channel only, post-pilot** | Can't dial an IVR; lower US reach; but read-receipts help acks |

**Channel strategy (why not Sinch / WhatsApp for the core):** the anchor is a
*programmable voice* problem — place a call, send DTMF, record the result.
WhatsApp is a messaging channel and cannot do it; Sinch can do voice but its
strength is carrier-grade messaging, whereas Twilio's voice-IVR tooling is the
strongest for the finicky navigation work (re-prompts, invalid-ID, voicemail). So:
**Twilio for voice + primary SMS**, **Telnyx as the redundant SMS provider**,
**WhatsApp as an optional user-preference channel later**. Everything sits behind
the [`TelephonyProvider`](../app/src/telephony/types.ts) / notify abstractions, so
swapping the *notify* layer for cost at scale never touches the voice-IVR core.
A2P 10DLC registration is required for US SMS regardless of provider.

## Cost model to compute (before pricing a contract)

Per-day unit cost = call minutes × telephony rate + STT compute + SMS/voice
segments. **Color lines amortize** one call across all users on that facility;
**Sentry lines cost one call per user per day.** Model both; it drives per-seat
pricing and which facilities are cheapest to serve first.

## Biggest risks, ranked

1. **IVR navigation fragility** (M2) — the true moat *and* the top risk. Mitigate
   with operator tooling + fail-safe-on-mismatch + health alerting.
2. **STT confidence trustworthiness** (M3) — the safety model rests on it. Mitigate
   with calibration + human-in-the-loop.
3. **TCPA / A2P compliance** — legal exposure + launch-blocking lead time. Start early.
4. **Being wrong in the dangerous direction** — held by the M0 asymmetric design;
   never relax the CLEAR threshold to cut false-MUST_TEST noise.
