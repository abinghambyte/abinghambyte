# Clearline

> **Never miss a check-in.** A reliable notification service for people on
> court-ordered random drug/alcohol testing who must call a status line every
> day to learn whether they need to test.

_Working name — "Clearline" is provisional (evokes both the phone line and being "in
the clear"). See [naming](docs/STRATEGY.md#naming) before it sticks._

**Status: Design phase.** This repository currently contains the product and
technical design. No application code yet — see the roadmap for what's next.

---

## The problem

People on probation, pretrial release, or in drug court are commonly enrolled in
**random testing**: they're assigned a color (or an ID/PIN) and must **call an
automated line every single day** to find out if they're required to test. If
their color/ID is "up" and they don't report that day, it's treated as a failed
test — a **violation that can send them back to jail**.

Missing a call is easy: shift work, no minutes on the phone, a dead battery, a
mishearing, a line that's busy after 5 p.m. The stakes are wildly out of
proportion to the mistake.

Paid services exist ([hotline2u](https://www.hotline2u.com/) at ~$5/mo, mycallin,
PDANS), but they've **narrowed to a single line type** (hotline2u dropped
color-code lines entirely in 2021), are **SMS-only and English-only**, and offer
**no court-showable proof** that the person checked in.

## What Clearline does

Every day, on schedule, for each enrolled person, Clearline:

1. **Calls their testing line** and navigates its phone menu (language → ID →
   name letters, or listens to a color recording).
2. **Transcribes and interprets** the result.
3. **Decides "test today?"** — and *only* says "you're clear" when it's highly
   confident. Otherwise it says **"we couldn't tell — call the line yourself."**
4. **Notifies across multiple channels** (SMS, voice call, email, push) and
   **escalates until the person acknowledges.**
5. **Logs everything** — including the recording — as a timestamped record the
   person can show a probation officer or court as proof they checked in.

## How we're different

| | hotline2u / mycallin | **Clearline** |
|---|---|---|
| Line types | Sentry only | Color-code **and** Sentry **and** others (pluggable) |
| Channels | SMS only | SMS + voice + email + push, **with escalation** |
| Language | English | Multilingual, SMS-first (works on a flip phone) |
| Proof of compliance | none | court-showable audit log + recordings |
| When unsure | (silent) | explicit "call it yourself" safety fallback |
| Who pays | the person on probation | **institutions & grants**; free/sponsored for individuals |

## Documentation

- **[docs/STRATEGY.md](docs/STRATEGY.md)** — path forward, business model, go-to-market, risks, funding.
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — technical design, stack, IVR-script model, safety logic, data model, privacy.
- **[docs/ROADMAP.md](docs/ROADMAP.md)** — phased delivery plan.

## Guiding principle

This is **safety-critical software for a vulnerable population.** Every design
decision is measured against one question: *what happens to the person if we're
wrong?* We fail loud, never silent; we default to "verify it yourself"; and we
never charge someone who can't afford to miss a test.
