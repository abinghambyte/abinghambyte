# Clearline — Phase 1 seed

The safety-critical check-in loop, driven by a **simulated phone line** — no
telephony, no cost, no real lines called. This is the demo you can run in front
of a pilot partner, and the spine the real adapters plug into later.

## Run it

Requires **Node ≥ 22.6** (uses built-in TypeScript type-stripping and the
built-in test runner — **zero dependencies, nothing to install**).

```bash
cd app
npm run demo    # run one simulated day across three facilities
npm test        # 25 tests, including the "no false CLEAR" invariants
```

## What the demo shows

One day, three facilities, driven end-to-end by the simulator:

- **A color-code line** — one shared call lists the day's colors; each enrolled
  person is resolved by their assigned color (announced → `MUST_TEST`, not
  announced at high confidence → `CLEAR`).
- **A Sentry line** — a personalized call per person (it sends each user's own
  DTMF: language, ID, name letters), including one **noisy, low-confidence**
  reading that correctly refuses to say "clear" and tells the person to verify.
- **A color line whose menu changed** — the simulator reports `menu_mismatch`
  and the system **fails safe** to "call the line yourself."

It ends with two safety self-checks: *no one who must test was told they were
clear*, and *every `CLEAR` met the high confidence bar*.

## Layout

```
src/
  domain/       types.ts + interpret.ts   ← the safety-critical core (pure, tested)
  telephony/    types.ts + simulator.ts   ← provider interface + the simulator adapter
  notify/       plan.ts                    ← ClearResult → channels + escalation
  audit/        types.ts                   ← the immutable, court-showable record
  worker/       check.ts                   ← runs a facility's day across its users
  demo/         fixtures.ts + run.ts       ← the runnable end-to-end demo
```

## The one rule this code exists to enforce

`interpret()` uses **asymmetric thresholds**: it only ever returns `CLEAR` at
confidence ≥ 0.90 with no test signal; *any* doubt becomes `MUST_TEST` or a
"verify yourself" state. The tests treat a single false `CLEAR` as a failure.
See [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) §5–§6.

## Not yet here (by design — see [`../docs/ROADMAP.md`](../docs/ROADMAP.md))

Real telephony (Twilio) + real STT (Whisper), persistence, the client PWA / proof
locker, and the case-manager dashboard. This seed is one package; it splits into
the `packages/` + `apps/` workspace layout when those land.

> `npm run typecheck` needs `typescript` installed (`npm i -D typescript`); the
> demo and tests run without it via Node's type-stripping.
