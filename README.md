# Clearline

> **Never miss a check-in.** A supervision-compliance companion for people on
> probation, pretrial release, or in drug court — starting with the daily
> drug-test status line they can't afford to miss, and covering everything else
> that can violate them.

_Working name — "Clearline" is provisional (the phone _line_ + being in the
_clear_). See [naming](docs/STRATEGY.md#naming) before it sticks._

**Status: Design phase.** This repository currently holds the product and
technical design. No application code yet — see the [roadmap](docs/ROADMAP.md).

---

## The problem

People on court-ordered supervision live under a web of obligations where **any
single miss can mean jail**: a daily call to a random drug-test line, PO
check-ins, court dates, required classes, community-service hours, fines and
fees, curfew. The system offers reminders for none of it and punishes every slip.

The most acute piece is the **daily testing line**: you're assigned a color (or
an ID/PIN) and must call an automated line *every single day* to find out if you
have to test. If your color is up and you don't report that day, it's treated as
a failed test — a violation. Missing the call is easy: shift work, no phone
minutes, a dead battery, a mishearing, a busy line after 5 p.m.

## Why we're not just another hotline2u

Paid services exist ([hotline2u](https://www.hotline2u.com/), mycallin, PDANS),
but each is a **single-feature utility**: it makes the daily call for you and
texts the result. You can't meaningfully out-feature a yes/no answer.

So we don't try to. **Clearline is a companion for the whole supervision period.**
The daily-call automation is the anchor that gets people in the door; the reason
they stay is everything around it.

| | hotline2u / mycallin | **Clearline** |
|---|---|---|
| **Scope** | one daily call | the whole supervision period |
| Line types | Sentry only | color-code **and** Sentry **and** others (pluggable) |
| Channels | SMS only | SMS + voice + email + push, **with escalation** |
| Language | English | multilingual, SMS-first (works on a flip phone) |
| Proof of compliance | none | **court-showable proof locker** (exportable PDF) |
| Beyond the call | none | compliance calendar, fee reminders, testing-site info, self-report help |
| For the agency | none | **case-manager caseload dashboard** |
| When unsure | (silent) | explicit "call it yourself" safety fallback |
| Who pays | the person on probation | **institutions & grants**; free/sponsored for individuals |

## What Clearline does

**Anchor feature — the daily call, automated.** Every day, on schedule, for each
enrolled person, Clearline calls their testing line, navigates its phone menu,
transcribes and interprets the result, and **only says "you're clear" when it's
highly confident** — otherwise it says **"we couldn't tell, call the line
yourself."** It notifies across multiple channels and escalates until the person
acknowledges.

**The companion around it:**

- **Proof locker** — a timestamped record of every check-in, test, and class,
  exportable as a PDF for a lawyer or PO at a violation hearing.
- **Compliance calendar** — every deadline, not just the test call: PO
  appointments, court dates, classes, community-service hours, fee due dates.
- **When your color's up** — testing-site address, hours, what to bring, transit
  directions, and a one-tap "I tested ✓."
- **Fee & fine reminders** — a common, invisible violation driver.
- **Self-report help** — an "I might miss it / I slipped" path that helps you
  proactively contact your PO and reach resources.
- **Case-manager dashboard** — the whole caseload at a glance (the institutional
  product).

**Accessibility first:** SMS-first anchor so it works for *everyone*, with a
progressive-web-app layer on top for those who can use it. Nothing requires a
smartphone or a data plan.

## How it's built & funded (the short version)

- **Open core.** The engine is open and self-hostable — which earns trust and
  lets a county's security team audit it. The **paid product** is the hosted
  operation, the maintained library of facility phone-menu scripts, and the
  caseload dashboard. (Why this makes money: institutions don't want to run a
  safety-critical phone system — they'll pay us to. See [STRATEGY](docs/STRATEGY.md).)
- **Sustainable mission venture.** Funded by institutional contracts + reentry
  grants; free or sponsored for individuals. Built to pay a small team and last —
  not to extract money from people who can't afford to miss a test.

## Documentation

- **[docs/STRATEGY.md](docs/STRATEGY.md)** — path forward, open-core model, go-to-market, risks, funding.
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — stack, IVR-script model, safety logic, companion features, data model, privacy.
- **[docs/ROADMAP.md](docs/ROADMAP.md)** — phased product/venture delivery plan.
- **[docs/DEV-ROADMAP.md](docs/DEV-ROADMAP.md)** — engineering build order: milestones, safety gates, compliance tracks, open decisions.
- **[docs/PILOT-LARIMER.md](docs/PILOT-LARIMER.md)** — first-pilot brief + outreach; **[docs/LEAVE-BEHIND-CJA.md](docs/LEAVE-BEHIND-CJA.md)** one-pager.

## Guiding principle

**Safety-critical software for a vulnerable population.** Every decision is
measured against one question: *what happens to the person if we're wrong?* We
fail loud, never silent; we default to "verify it yourself"; and we never charge
someone who can't afford to miss a test.
