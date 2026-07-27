# IVR Navigation — design & strategy

This is **the hard part** of Clearline, and the one true technical risk. Getting
a wrong answer here — or hanging, or looping forever — is the failure mode that
matters. This doc is the strong perspective we're building from.

---

## 1. The problem, stated honestly

We phone a county line. It plays audio. We must respond — press digits, or wait —
at the right moments, cope with variation, detect failure, and capture the
result. And we must do this reliably across **hundreds of different lines**, each
of which can change its menu without telling anyone.

A static, blind script (play digits on a timer, then record) — what the current
Twilio adapter does — cannot survive contact with reality. Real lines throw:

- variable prompt lengths and timing; long intros; hold music
- `"invalid ID, please try again"` retry loops
- language menus and sub-menus, re-ordered options
- answering machine / voicemail
- `"please hold"`, `"all circuits busy"`
- silence and dead air
- the *same meaning* phrased ten different ways
- a menu that quietly gained a new "take our survey" prompt last Tuesday

## 2. The core idea

Navigation is a **closed loop over a partially-observable environment**:

> **perceive → decide → act**, repeated, until we capture the result or fail safe.

The single most important design decision is to **separate the transport (how we
hear and act) from the policy (what to do)**. Same pattern that made the rest of
the system testable. That gives three layers:

```
   ┌─────────────────────────────────────────────────────────────┐
   │ POLICY  — the navigation state machine (pure, deterministic) │  ← the brain
   │   states, transitions guarded by observed INTENT, actions     │
   └───────────────▲───────────────────────────┬──────────────────┘
                   │ intent                      │ action (send digits / wait / record / hang up / flag)
   ┌───────────────┴──────────┐   ┌──────────────▼──────────────────┐
   │ PERCEPTION — text→intent │   │ TRANSPORT — the ears and hands   │  ← swappable
   │   (pure, testable)        │   │   Gather-webhook  |  Media Streams│
   └───────────────────────────┘   └─────────────────────────────────┘
```

- **Policy** is a declarative, per-facility **state machine** (`NavFlow`) — pure,
  deterministic, versioned like our IVR scripts, and **exhaustively testable
  against a simulated call**. It never hangs (turn/visit/unknown guards) and
  always fails safe.
- **Perception** turns a prompt (text) into a normalized **intent**
  (`enter_id`, `invalid_id`, `result`, `voicemail`, `unknown`, …). Pure.
- **Transport** is the only part that touches telephony. Two implementations
  (below) both drive the *same* policy engine.

Because policy + perception are pure, we test *"invalid-ID retry then success"*,
*"voicemail → hang up + flag"*, *"menu changed → flag"*, and *"result captured"*
with **no telephony at all** — via a scripted `SimulatedSession`. That is what
makes the hard part tractable and safe.

## 3. The two transports (and which to build first)

Both implement one `CallSession` port: `nextPrompt()`, `sendDigits()`,
`record()`, `hangup()`.

| | **A · Gather + webhook** | **B · Media Streams + own ASR** |
|---|---|---|
| How | Twilio `<Gather input="speech">` ASRs each prompt, posts to our webhook; we return the next TwiML | Twilio streams raw audio over a WebSocket; our own VAD + Whisper; DTMF via the API |
| Infra | An HTTP endpoint + per-call state (needs M1 persistence) | A WebSocket server + real-time audio pipeline |
| Fidelity | Twilio's ASR, per-turn round trips | Our Whisper + grammar, precise timing, barge-in |
| Effort | Lower — ships sooner | Higher |
| Best for | most lines, the first pilot | lines where Gather's ASR/timing is inadequate |

**Recommendation: build A (Gather-webhook) first**, keep the engine
transport-agnostic, and add B (Media Streams) as a per-facility fidelity upgrade
where A proves inadequate. The policy engine — the risky part — is identical for
both and is **built and tested now**, ahead of either transport.

## 4. The policy model (`NavFlow`)

A state machine. Each state observes the current prompt, maps it to an intent,
and takes an action:

- **actions:** `sendDigits` (supports `{{user.*}}`), `wait` (let the prompt keep
  playing), `record` (capture the result → done), `hangup`, `flag` (fail safe).
- **transitions:** `on: [{ intent, action, next }]`, plus a `default`.
- **guards (the safety spine):** `state.maxVisits` (kills invalid-ID infinite
  loops), `flow.maxTurns` (never runs forever), and an `unknown`-streak limit
  (a changed menu → `flag` → `menu_mismatch`, not a guess).

This supersedes the linear `IvrScript` for robust lines; the linear script +
static TwiML compiler remain as a simple fallback.

## 5. Safety properties (non-negotiable)

1. **Fail safe, always.** Every unhandled situation — unknown prompt streak,
   retry exhaustion, voicemail, turn cap — ends in a non-`completed` status that
   `interpret()` renders as `UNREACHABLE`/`AMBIGUOUS` → *"call the line
   yourself."* Never a guess, never a false CLEAR.
2. **Never hangs.** Bounded by `maxTurns`, `maxVisits`, and the unknown-streak
   limit. Every loop terminates.
3. **Credential-invalid is distinguishable.** Retry-exhaustion carries a reason
   so the user can be told *"your ID may be wrong,"* rather than a generic error.
4. **The result still goes through the confidence gate.** Capturing the result
   audio doesn't bypass M3 — low transcription confidence still → verify-yourself.

## 6. Testing strategy

- `recognizeIntent()` and `runNavigation()` are pure and unit-tested against a
  scripted `SimulatedSession` that reproduces every failure mode deterministically.
- Adversarial call scenarios are first-class tests: retry-then-succeed,
  retry-exhausted, voicemail, changed-menu, dead air, result-captured.
- The golden rule still holds end to end: **no path produces a false CLEAR.**

## 7. Operator tooling (the moat)

The state machines are data. The durable advantage is a tool that lets an
operator **record a real call, see each prompt transcribed, build/version the
`NavFlow`, dry-run it against the recording, and watch per-facility health** so a
changed menu is caught (via the `menu_mismatch` rate) before it hurts anyone.
Maintaining hundreds of these flows *is* the business; the engine is just what
runs them.

---

**Status:** built and tested end to end. The policy engine is a pure step reducer
(`nav/engine.ts` `advance`), shared by the loop driver (simulator) and the
**Gather-webhook transport** (`nav/webhook.ts` + `api/`), which drives a live call
one webhook at a time and persists the decision on completion — smoke-tested over
real HTTP (`npm run serve`). The **Media Streams** transport (own VAD + Whisper)
is the remaining fidelity upgrade for lines where Gather's ASR is inadequate; it
reuses the same reducer.
