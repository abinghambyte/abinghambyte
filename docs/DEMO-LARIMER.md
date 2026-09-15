# Larimer Demo — Runbook

Everything to walk into the Larimer County CJA meeting and show the product. The
goal of the meeting is **one thing: a yes to a free pilot.** Nothing else.

## What you're bringing

| Piece | What it is | When to use |
|---|---|---|
| **Interactive proposal page** | https://claude.ai/artifact/8tNAQ2tJe7JoQRpWzbej7x | Open on a laptop/tablet in the room; send as the follow-up link |
| [LEAVE-BEHIND-CJA.md](LEAVE-BEHIND-CJA.md) | One-page printed leave-behind | Hand across the table at the end |
| [PILOT-LARIMER.md](PILOT-LARIMER.md) | Pilot brief + outreach + contacts | Your prep; not shown |
| Live demo (optional) | `npm run serve` + `npm run demo:proof` | Only if they're technical and want to see it *actually run* |

Aim it at **Emily Humphrey, Director, CJA** — she owns the DRC + Pretrial pilots.

---

## The 6-minute flow

Open the proposal page and drive it top to bottom. Talk to these beats.

**1 · The problem, their words (45s).** "Most program failures aren't dirty
tests — they're technical. A participant misses the daily call because their
phone died, and a missed call becomes a missed test becomes a hearing. That's a
jail bed and staff hours for a failure that was never about drug use."

**2 · Watch a check-in (90s — the centerpiece).** Click **Run today's check** on
the page. Then switch to **Noisy line** and run it again. This is the whole
pitch: *"Same words as a clear day — but the line was noisy, so it does not say
'you're clear.' It tells the person to call the line themselves. It is built to
never guess in the dangerous direction, and there are 88 automated tests holding
that line."* This is what earns trust with a risk-averse buyer.

**3 · Not another hotline2u (45s).** Scroll to the comparison. "Paid apps make
the call and text a yes/no. We don't compete on the yes/no — we cover the whole
supervision period, we keep a court record, and we give *you* a dashboard. And we
support **both** lines you run — the Sentry UA line and the DRC color lines."

**4 · The proof locker (60s).** Scroll to the record. "Every check-in becomes a
timestamped, tamper-evident entry a participant can hand a PO or lawyer at a
hearing. It helps you revoke *when it's warranted* with real evidence — and
extend leniency defensibly when it isn't. It's also your grant outcome data."

**5 · The ask (60s).** Scroll to the pilot block. "A free pilot, one program, a
handful of consenting participants, a human watching every uncertain reading. We
measure one number together: the change in accidental missed check-ins. You keep
the data." Then **stop talking** and ask your discovery questions.

**6 · Discovery (remaining time).** Ask the four questions on the page. You're
learning their real numbers *and* letting them feel understood. The incumbent
question ("do you already use a vendor?") is the most important — ask it early.

Close: hand the leave-behind, offer the link, propose a small next step (a scoping
call with their DRC or Pretrial lead).

---

## If they want to see it actually run

Some justice-IT folks won't believe a slide. Show the real thing:

```bash
cd app
npm run demo:nav      # the engine steering a MESSY call: junk intro, rejected ID
                      # (retry), result — plus voicemail/changed-menu fail-safes
npm run demo:proof    # generates the court-showable HTML record; open it
npm run serve         # then, in another terminal, drive a live call over HTTP:
```

With `serve` running, a call is literally navigated over HTTP webhooks (the same
thing Twilio does). The [app README](../app/README.md) has the curl sequence. The
line to land: *"this isn't a mockup — the decision logic and the call navigation
are real and tested; what's left is wiring a phone number and a database."*

---

## Objections, pre-loaded

- **"Aren't you helping them evade testing?"** → The opposite. It gets *more*
  people to test when required, and the record makes testing *more* defensible.
  Nobody is told they're clear on a bad read.
- **"What if it's wrong?"** → It fails loud, never silent. Every uncertainty
  becomes "call the line yourself," and a human reviews low-confidence reads
  during the pilot.
- **"We can't share our roster / data."** → Good — participants enroll
  themselves with their own ID; you share nothing. (This also keeps us out of
  CJIS scope.)
- **"What does it cost us?"** → The pilot is free. Long-term it's an
  institutional license or grant-funded; participants are never charged.
- **"We already have something."** → Then help me understand where it falls
  short — the record? the dashboard? the color-line support? (Pivot to fit.)

---

## Before you send this proposal / walk in

- [ ] Fill in your name + email in the page footer and the leave-behind.
- [ ] Confirm the current CJA director's name (public listings lag).
- [ ] Have a working `npm run demo:nav` on your laptop as backup.
- [ ] Know your one ask: **a free pilot with one program.**
