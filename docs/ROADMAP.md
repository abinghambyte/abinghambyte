# Roadmap

Phased delivery. Each phase ends with something real you can show a partner or a
grant reviewer. The guiding constraint throughout: **never ship a path that can
produce a false "you're clear."**

---

## Phase 0 — Design & alignment  ·  _(this repo, now)_

- [x] Problem definition and competitive analysis
- [x] Strategy: structure, revenue, go-to-market, risk ([STRATEGY.md](STRATEGY.md))
- [x] Technical architecture, IVR-script model, safety logic ([ARCHITECTURE.md](ARCHITECTURE.md))
- [ ] Decide entity structure (PBC vs nonprofit) — needs a founder/legal conversation
- [ ] Pick and secure the final product name + domain
- [x] Identify a first pilot target — **Larimer County, CO (CJA)**; runs both
      Sentry and color lines. See [PILOT-LARIMER.md](PILOT-LARIMER.md)
- [ ] Reach out to Larimer CJA — *after* the Phase 1 demo exists (don't pitch
      vaporware)

**Exit:** shared understanding + a named first partner to design against
(**Larimer County CJA** — [PILOT-LARIMER.md](PILOT-LARIMER.md)).

## Phase 1 — MVP core loop (simulated)  ·  _weeks 1–3_

Prove the whole loop end to end **without spending a dollar or calling a real
line**, using the simulator telephony adapter.

- [ ] Monorepo scaffold (`domain`, `telephony`, `transcription`, `notify`, `api`, `worker`)
- [ ] `domain`: `ClearResult` types + `interpret()` + **asymmetric safety
      thresholds**, with exhaustive unit tests (the false-CLEAR gate)
- [ ] `telephony` interface + **`simulator` adapter** with scripted menus and
      failure modes (busy, menu-changed, garbled)
- [ ] IVR script format + a color-code and a Sentry example script
- [ ] `transcription` interface + Whisper adapter (+ a stub for tests)
- [ ] `worker`: scheduler → CheckJob → interpret → NotifyJob
- [ ] `notify`: interface + a console/log adapter; escalation state machine
- [ ] Immutable AuditRecord persistence
- [ ] `ProofRecord` written for each confirmed event (proof-locker foundation —
      nearly free given the audit log)
- [ ] CI running the full loop against the simulator

**Exit:** `pnpm demo` runs a full day for a fake facility + users, produces
correct notifications and an audit record, and **provably never emits a false
CLEAR** in the test suite.

## Phase 2 — Real telephony + real notifications  ·  _weeks 4–7_

- [ ] `twilio` telephony adapter (outbound call, DTMF, recording, webhooks)
- [ ] Real STT wired in; confidence calibration against real (synthetic) audio
- [ ] Real notify channels: SMS + automated voice; email; ack handling
- [ ] Timezone-correct per-facility scheduling; shared-call de-dup for color lines
- [ ] Operator console v0: review low-confidence readings, repair scripts,
      facility health dashboard
- [ ] **Proof locker v0** — client PWA screen + downloadable `ProofExport` PDF
      (the first companion feature; the anchor's audit data made visible)
- [ ] Security baseline: field encryption, retention timers, consent capture
- [ ] **Legal review** of recording/auto-dialing/data handling

**Exit:** a controlled live pilot with a handful of consenting users on one real
facility line, with a human operator watching every reading.

## Phase 3 — Pilot hardening & proof  ·  _weeks 8–14_

- [ ] Redundant notify path (second SMS provider)
- [ ] **Compliance calendar** — `Obligation`s beyond the test call (PO check-ins,
      court dates, classes, community service, fee due dates) through the same
      scheduler + escalation
- [ ] **Case-manager dashboard** — org-scoped caseload view (the institutional
      product surface; built alongside the first pilot partner)
- [ ] Testing-site logistics on `MUST_TEST`; fee reminders; self-report flow
- [ ] Multilingual templates
- [ ] Monitoring/alerting, SLOs, on-call runbook
- [ ] Facility health auto-detection (menu-change early warning)
- [ ] Measure & document: reliability, and reduction in accidental violations
      (with an evaluation partner if possible)

**Exit:** a data-backed pilot result — the core asset for grants and the next
institutional sale.

## Phase 4 — Institutional scale  ·  _quarter 2+_

- [ ] Multi-tenant org isolation, roles, admin
- [ ] Self-host packaging (containers, IaC) for security-conscious institutions
- [ ] Billing/contracts for institutional partners; "sponsor an account" for
      individuals
- [ ] Onboard additional facilities/line types; grow the shared script library
- [ ] Grant applications (SAMHSA STREETS, BJA Second Chance, foundations)

**Exit:** multiple paying institutional partners and/or grant funding; a growing,
centrally-maintained library of facility scripts.

---

## Cross-cutting invariants (every phase)

1. **No false CLEAR.** Any uncertainty → "verify it yourself." Enforced in tests.
2. **Fail loud, never silent.** A missing reading is a *higher*-risk day.
3. **Don't tax the person on probation.** Individuals are free or sponsored.
4. **Human in the loop** until reliability is proven per facility.
5. **Privacy first.** Minimal retention, encryption, informed consent.

## Immediate next actions

When you're ready to build (Phase 1), the highest-leverage first commit is the
`domain` package: the `ClearResult` types, `interpret()`, the safety thresholds,
and their unit tests. Everything else plugs into that spine, and the simulator
adapter lets us exercise it end to end for free. Say the word and I'll scaffold it.
