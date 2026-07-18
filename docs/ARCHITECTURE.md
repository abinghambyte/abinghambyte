# Technical Architecture

Design for the Clearline check-in service. This is **safety-critical software**;
the recurring design test is *"what happens to the person if this component is
wrong?"* — and the answer must always be "we fail loud and tell them to verify,
never silently say they're clear."

---

## 1. Stack decision: TypeScript / Node

Chosen for:

- **One language end to end** — HTTP API, telephony webhooks, background workers,
  and the web UI share code and types (a shared `domain` package of types keeps
  the safety-critical logic consistent everywhere).
- **First-class telephony SDKs** — Twilio's Node SDK and TwiML are mature; DTMF
  navigation and call recording are well documented.
- **Strong typing on the dangerous parts** — the "test today?" decision is a
  discriminated union (`ClearResult`), so ambiguous states can't be accidentally
  collapsed into "clear."
- **Easy hiring & contribution.**

Transcription (Whisper) runs as a **separate service** (Python/`faster-whisper`
or a hosted STT API behind the same interface), so the ML runtime choice doesn't
constrain the app language.

**Runtime shape:** Node 20+, TypeScript, a monorepo (pnpm workspaces).

```
packages/
  domain/         # shared types + the safety decision logic (pure, unit-tested)
  telephony/      # provider abstraction + adapters (simulator, twilio, ...)
  transcription/  # STT abstraction + adapters (whisper, deepgram, ...)
  notify/         # channel abstraction + adapters (sms, voice, email, push)
apps/
  api/            # HTTP API + telephony webhooks (Fastify)
  worker/         # scheduler + call/notify jobs (BullMQ on Redis)
  web/            # operator + client dashboard (later)
```

## 2. Component overview

```
                    ┌─────────────┐
   schedule (cron)  │  Scheduler  │  per-facility "call after HH:MM" in facility TZ
                    └──────┬──────┘
                           │ enqueues CheckJob per (facility, day)
                           ▼
   ┌───────────────────────────────────────────────┐
   │  Worker: CheckJob                              │
   │  1. telephony.placeCall(facility.ivrScript)    │───▶ Telephony provider
   │  2. record audio of the result segment         │◀─── (Twilio / simulator)
   │  3. transcription.transcribe(recording)        │───▶ STT service (Whisper)
   │  4. domain.interpret(transcript, facility)     │
   │       → ClearResult { status, confidence }     │
   │  5. for each enrolled user on this facility:    │
   │       resolve their personal result            │
   │       enqueue NotifyJob                         │
   │  6. write immutable AuditRecord (+ recording)  │
   └───────────────────────────────────────────────┘
                           │
                           ▼
   ┌───────────────────────────────────────────────┐
   │  Worker: NotifyJob (per user)                  │
   │  send via primary channel → await ack          │───▶ Notify channels
   │  escalate on no-ack (retry, next channel)      │◀─── (SMS/voice/email/push)
   └───────────────────────────────────────────────┘
```

**Why facility-centric:** many people share one testing line (same county
office). For **color-code** lines, one call gets the day's colors and serves
*every* user on that facility. For **per-person IVR** lines (Sentry: enter *your*
ID), each user needs their own call, but the *script* is still shared. Modeling
the **Facility** as the owner of the IVR script means a menu change is fixed once
and every user benefits.

## 3. Telephony abstraction (the pluggable core)

A single interface; swappable adapters. This is what lets us **develop and test
the entire system with zero cost and without ever calling a real probation
line.**

```ts
interface TelephonyProvider {
  placeCall(opts: {
    to: E164;
    script: IvrScript;         // how to navigate the menu
    recordFrom: RecordTrigger; // when to start capturing the result audio
    maxSeconds: number;
  }): Promise<CallOutcome>;     // { recordingUri, digitsSent, events, status }
}
```

Adapters:

- **`simulator`** — plays canned recordings / scripted menus. The default for
  development, CI, and demos. Lets us reproduce "busy line," "menu changed,"
  "garbled audio," and every edge case deterministically. **Built first.**
- **`twilio`** — real outbound calls; DTMF via TwiML `<Play digits="...">`,
  recording via `<Record>` / Media Streams; results delivered to the `api`
  webhook. The first real-world adapter.
- **`asterisk` / `freeswitch`** — later, for institutions that self-host
  telephony for cost/compliance.

## 4. IVR script model

The interesting technical core: a **declarative, per-facility state machine** that
describes how to get from "line answers" to "the result audio." Declarative (not
code) so scripts are data — editable, versioned, and reviewable without a deploy.

```jsonc
{
  "facilityId": "fac_travis_co_tx",
  "type": "sentry",            // "color_code" | "sentry" | "custom"
  "version": 4,
  "phone": "+1800...",
  "steps": [
    { "wait": "prompt", "expect": "language",     "timeoutSec": 20 },
    { "sendDigits": "1" },                          // English
    { "wait": "prompt", "expect": "id",           "timeoutSec": 15 },
    { "sendDigits": "{{user.testingId}}#" },        // per-user substitution
    { "wait": "prompt", "expect": "name",         "timeoutSec": 15 },
    { "sendDigits": "{{user.lastNameFirst3Dtmf}}" },
    { "record": { "start": "afterPrompt", "expect": "result", "maxSec": 30 } }
  ],
  "resultGrammar": {           // how to interpret the recording (see §5)
    "clearPhrases":   ["you are not required", "no test", "not scheduled"],
    "testPhrases":    ["you are required", "report today", "must test"],
    "colorList":      null      // for color_code: the list of valid colors
  }
}
```

- `{{user.*}}` fields are filled per user from their **encrypted** enrollment
  record (testing ID, last-name letters). For color-code facilities there are no
  per-user secrets — the call is shared.
- Scripts are **versioned**; every AuditRecord stores the script version used, so
  a later menu change never rewrites history.
- A step that times out or hits an **unexpected prompt** aborts to the safe
  fallback (§6) and flags the facility for operator review — this is our early
  warning that a menu changed.

## 5. Interpreting the result (transcription → meaning)

1. **Transcribe** the recorded result segment (`transcription` package; Whisper
   by default, self-hostable).
2. **Interpret** via `domain.interpret()`:
   - **Sentry/per-person:** match `clearPhrases` vs `testPhrases`. Both or
     neither present → `AMBIGUOUS`.
   - **Color-code:** extract the announced colors; compare to the user's assigned
     color. This runs per user at notify time from one shared recording.
3. Output a typed, confidence-scored result — never a bare boolean:

```ts
type ClearResult =
  | { status: "MUST_TEST";  confidence: number; evidence: string }
  | { status: "CLEAR";      confidence: number; evidence: string }
  | { status: "AMBIGUOUS";  reason: string }   // conflicting/none → verify
  | { status: "UNREACHABLE"; reason: string };  // line busy/failed → verify
```

**Asymmetric thresholds (the single most important safety rule):**

- Emit `CLEAR` **only** if confidence ≥ a high bar (e.g. 0.9) *and* no test
  phrase/color matched. Any doubt does **not** become "clear."
- Emit `MUST_TEST` on a much lower bar — when in doubt, assume you must test.
- `AMBIGUOUS` / `UNREACHABLE` → notify **"we couldn't confirm — call the line
  yourself,"** and queue for operator review. **We are never silent.**

## 6. The safe fallback

Any failure (menu mismatch, timeout, low confidence, STT error, provider outage)
resolves to a **"verify it yourself" notification**, not a missing message. A day
with no confirmed reading is treated as *higher* risk, not lower. Operators are
alerted so a human can re-check before the testing window closes.

## 7. Scheduling & time

- Each facility has a **"results available after" time in its own timezone**
  (e.g. "after 5:00 PM America/Chicago"). The scheduler fires the CheckJob in
  facility-local time and retries until a confident reading or the window closes.
- **DST-safe** (store IANA timezones, not offsets).
- Per-facility rate limiting so we don't hammer a line; shared-call de-duplication
  for color-code facilities.

## 8. Notifications & escalation

`notify` package with a channel interface and adapters: **SMS, voice call, email,
web/mobile push.** Escalation policy per user:

1. Send via primary channel (usually SMS — works on any phone).
2. If no acknowledgement within N minutes, retry / escalate to the next channel
   (e.g. SMS → automated voice call).
3. Escalate hardest for `MUST_TEST` and `AMBIGUOUS`; a `CLEAR` day still notifies
   but with less aggressive escalation.
4. Every message links to the audit record (the proof they can show).
5. Multilingual templates; SMS-first for accessibility.

## 9. Data model (initial)

```
Organization      — an institutional partner (court, county, nonprofit) OR "self"
User              — a person being notified; belongs to an Organization
Facility          — a testing line; owns an IvrScript(version); has a timezone
Enrollment        — links User ↔ Facility; holds per-user encrypted credentials
                    (testingId, lastNameLetters) and assignedColor (nullable)
CheckJob          — one attempt to read a Facility on a given day
AuditRecord       — immutable: transcript, ClearResult, recordingUri, scriptVersion,
                    timestamps, provider events (the court-showable proof)
Notification      — per-user message: channel, status, ackedAt

# Companion layer (see §13)
Obligation        — a compliance item on the user's calendar: type (test | po_checkin
                    | court_date | class | community_service | fee_payment | curfew),
                    dueAt, timezone, location, status, source
ProofRecord       — a verified compliance event (test taken, class attended, call
                    made) linked to its AuditRecord; the unit of the proof locker
ProofExport       — a generated, timestamped PDF of a date range for court/PO
SupportContact    — optional person (family, sponsor) with consented read access
CaseManager       — an Organization staff user with a scoped view of a caseload
```

## 10. Reliability & operations

- **Idempotent jobs**, durable queue (BullMQ/Redis), retries with backoff.
- **Health monitoring** per facility: success rate, confidence distribution,
  menu-mismatch rate → alerts when a line likely changed.
- **On-call operator console** to review low-confidence readings and repair
  scripts.
- **Redundancy** on the notify path (multiple SMS providers) — the last mile must
  not have a single point of failure.
- **SLOs** defined around "confirmed reading delivered before the testing
  window" and "zero false-CLEAR."

## 11. Security & privacy

This is PII for a **vulnerable, legally-exposed population.** Non-negotiables:

- **Encrypt at rest** (per-field encryption for testing IDs, names, phone
  numbers) and in transit everywhere.
- **Minimal retention** — recordings and transcripts kept only as long as needed
  for the compliance record / dispute window, then purged on a policy timer.
- **Explicit, informed consent** at enrollment, including recording consent
  (mind **two-party-consent** states) and the clear statement that Clearline is a
  **backup, not a replacement** for the person's own duty to check.
- **Access controls & audit** on every read of a user's data; org-scoped
  isolation for multi-tenant institutional deployments.
- **Self-hostable** so institutions with strict data-residency rules can run it
  in their own environment.
- **Legal review** of recording/auto-dialing/data-handling before any live pilot.

## 12. Testing strategy

- `domain.interpret()` and the safety thresholds are **pure functions with
  exhaustive unit tests**, including adversarial transcripts (conflicting
  phrases, near-misses, homophones of colors).
- The **simulator** telephony adapter drives full end-to-end integration tests in
  CI with no cost and no real calls.
- A **fixture library** of realistic (synthetic) IVR recordings for regression
  testing transcription + interpretation.
- Golden rule under test: **no input ever produces a false `CLEAR`.**

## 13. Companion layer

The daily-call loop (§2–§8) is the **anchor**. The product's differentiation and
retention come from the companion features built on the same spine:

- **Proof locker** — `ProofRecord`s (each linked to an immutable `AuditRecord`)
  aggregate into a `ProofExport`: a timestamped PDF a user can hand a PO or
  lawyer at a violation hearing. This is the single most valuable feature
  competitors lack, and it reuses the audit data we already produce.
- **Compliance calendar** — `Obligation`s of every type (not just the test call)
  flow through the *same* scheduler and notify/escalation machinery. A court date
  is just another obligation with a due time and a reminder policy.
- **Testing-site logistics** — when a `MUST_TEST` result fires, attach the
  facility's collection-site address, hours, what-to-bring, and transit info.
- **Fee/fine reminders**, **self-report help** (a guided "contact your PO now"
  flow), and optional **`SupportContact`** read access (consented).
- **Case-manager dashboard** — an org-scoped view over `User` / `Obligation` /
  `AuditRecord` for a whole caseload. This is the institutional product surface
  and the thing partners pay for.

**Delivery:** SMS-first for every feature that can be (reminders, results,
acknowledgements) so nothing requires a smartphone or data plan; a **progressive
web app** layer adds the calendar, proof locker, and dashboard for users and case
managers who can use it. The PWA is a client of the same `api` — no separate
backend.

**Sequencing:** none of this precedes a rock-solid anchor. The proof locker comes
first (it's nearly free given the audit log), then the calendar, then the
case-manager dashboard alongside the first institutional pilot. See the roadmap.
