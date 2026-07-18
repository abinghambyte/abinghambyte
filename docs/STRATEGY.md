# Strategy & Path Forward

**Goal (decided): a sustainable mission venture** — real impact *and* enough
revenue to pay a small team and last. Funded by institutional contracts + reentry
grants, free or sponsored for individuals. Not a get-rich play (serving a
low-income population caps user extraction), and not a grant-dependent charity
either — a durable, mission-aligned business.

Short version: **the code is the easy part.** Reliability, liability, and
reaching the users are the real problems, and all three are solved by the same
move — **partner *with* the institutions that supervise these clients rather than
routing around them.** And the product wins not by out-answering a yes/no call,
but by **being the companion for the whole supervision period.**

---

## 1. Open core — the model that makes money *with* open source

"If it's open source and self-hostable, I can never make money" is a myth.
GitLab, Sentry, Supabase, PostHog, and HashiCorp are all open source and all make
real money. The model is **open core**: open the engine, charge for *operating*
it and for the hard parts around it.

Why self-hosting doesn't kill revenue *here* specifically:

1. **The paying customers are institutions, and they don't want to run this.** A
   county or court will not staff a safety-critical telephony system, maintain
   hundreds of IVR scripts, wire up transcription, and be on-call when a phone
   menu changes at 2 a.m. They will pay us to run it. Self-hostability is a
   **procurement/security checkbox**, not something most will actually use.
2. **The individuals who need it can't self-host anyway** — so it's irrelevant to
   them.

**The moat was never the code.** It is:

- The **maintained library of facility IVR scripts** — hundreds of phone lines
  kept working as their menus silently change. Compounding operational labor,
  painful to fork; can remain the *paid/proprietary* layer even with an open engine.
- **Reliability track record and trust** with agencies.
- **Institutional contracts and relationships.**
- **Outcomes data** that wins grants and renewals.

**So: open the engine** (earns trust, lets a county's security team audit it,
invites contribution); **keep the hosted operation + the script catalog + the
caseload dashboard as the paid product.** That is the open-core line.

## 1a. Differentiation — a companion, not a clone

You cannot differentiate the core answer ("do I test today?") — it's a yes/no,
and every competitor gives it. So we expand the *job*. A person on supervision
juggles a web of obligations where any miss can mean jail: the daily test call,
PO check-ins, court dates, required classes, community-service hours, fines/fees,
curfew. Nobody helps them hold all of it.

**Clearline is the compliance companion for the whole supervision period.** The
daily-call automation is the anchor/wedge; retention comes from everything around
it — the **proof locker** (court-showable record, which hotline2u utterly lacks),
the compliance calendar, testing-site logistics, fee reminders, self-report help,
and the **case-manager dashboard** that institutions actually buy. Delivered
**SMS-first for everyone**, with a progressive-web-app layer on top — never
requiring a smartphone or data plan.

## 2. The three real problems

1. **Reliability / safety.** A wrong "you're clear today" can put someone back in
   jail. The bar is not "works most of the time" — it's "never wrong in the
   dangerous direction, and loud when unsure."
2. **Liability.** If we tell someone they don't need to test and we're wrong,
   the harm is severe and the legal exposure is real. Phone menus change without
   notice; audio is noisy; people mistype IDs.
3. **Distribution.** People on probation are **not searching for SaaS.** They're
   low-income, often on prepaid phones, sometimes distrustful of anything that
   looks official. You cannot reach them efficiently with ads.

Notice that **all three problems have the same solution.**

## 3. The core strategic insight

A random third-party auto-caller is an **adversarial workaround** the court
doesn't know about — maximum liability, hardest distribution, easy to distrust.

The **same tool, endorsed by the supervising agency, is a sanctioned compliance
aid.** And the incentives align: **courts and probation departments *want* fewer
missed tests.** A missed test → a violation hearing → often a jail booking, which
costs the county money, a case manager's time, and a judge's docket slot. A tool
that reduces accidental violations is a *budget win* for them, not a threat.

That one reframe simultaneously:

- **Fixes distribution** — the PO, case manager, public defender, or treatment
  counselor hands it to the client. That's the channel.
- **Defuses liability** — you're a disclosed partner operating with the agency's
  knowledge, not a secret intermediary. Expectations and disclaimers are set up
  front, together.
- **Builds trust** — it arrives via someone the client already deals with.

## 4. Recommended structure

**A public-benefit company (PBC) or a nonprofit / fiscally-sponsored project.**

- It's the honest structure for serving a vulnerable, low-income population.
- It unlocks **grant funding** (see §6) that a plain for-profit can't easily reach.
- It makes institutional and government partnerships dramatically easier —
  procurement and legal are far more comfortable with a mission-driven entity.

A PBC keeps the option of earned revenue and eventual sustainability without
grant dependence; a nonprofit maximizes grant access. Either is defensible; the
PBC is the more flexible default.

## 5. Revenue model (in priority order)

1. **Institutional / government contracts (primary), sold as hosted open-core.**
   Counties, drug courts, reentry organizations, treatment centers, and public
   defender offices pay a **flat program fee or per-seat license** for the hosted
   service (we operate it, maintain the scripts, staff on-call) plus the
   **case-manager dashboard**, and distribute it to their clients for free. One
   sale covers many users, churn is low, incentives are aligned, the buyer has an
   actual budget — and self-hostability is the checkbox that clears procurement,
   not a revenue leak.

2. **Grants (primary, especially early).**
   Reentry and recidivism reduction is a heavily funded space. Grants fund the
   build and the free tier while institutional contracts ramp. (See §6.)

3. **Sponsored / low-cost individual accounts (supplementary).**
   For people whose agency isn't a partner yet: free where possible, sliding
   scale otherwise, and a **"sponsor an account"** mechanism (donors, or the
   person's own family, cover the cost). **Never** the core revenue, and **never**
   a paywall in front of someone who can't afford to miss a test.

## 6. Funding evidence (live opportunities)

Real, currently-active programs that fit this work:

- **SAMHSA — STREETS program** — explicitly funds *digital health technologies to
  reach underserved populations* around addiction/recovery. Up to **$3M/yr for
  four years**. <https://www.samhsa.gov/grants/grant-announcements/sm-26-019>
- **BJA — Second Chance Act / Innovations in Reentry** — federal reentry &
  recidivism-reduction funding to states, localities, and tribes.
  <https://csgjusticecenter.org/resources/funding/opportunities/second-chance-act-grant-program/>
- **Arnold Ventures — Criminal Justice Research Grants** — >$15M awarded in H1
  2025 for evidence-based recidivism reduction. <https://www.arnoldventures.org/>
- **Independence Foundation — Reentry, Recidivism & Restorative Justice.**
  <https://independencefoundation.org/funding-initiatives/reentry-recidivism-restorative-justice>
- **State reentry programs** (e.g. Illinois DHS "Successful Reentry," ~$1M).

The strongest grant applications will pair the tech with a **research/evaluation
partner** to measure the reduction in accidental violations — that evidence is
itself fundable and is the best B2G sales asset you can have.

## 7. Go-to-market

**Land through institutions, expand through outcomes.**

1. **Pilot** with one friendly partner — a single drug court, county probation
   office, reentry nonprofit, or treatment center. Free pilot, tight feedback.
2. **Measure** accidental-violation reduction and check-in reliability.
3. **Use that data** to (a) win grants and (b) sell adjacent counties/courts.
4. Individuals whose agency isn't a partner can still self-enroll (free/
   sponsored), which also seeds demand that pulls in their agency.

Secondary channels: defense-attorney and reentry-org networks, treatment-provider
associations, and drug-court conferences.

## 8. Competitive positioning

| Competitor | Weakness we exploit |
|---|---|
| **hotline2u** | Sentry-only (abandoned color code), SMS-only, English-only, no proof-of-compliance, charges the individual. |
| **mycallin / PDANS** | Similar single-channel, individual-pays consumer model; limited line coverage. |

Our wedge: **breadth of supported line types**, **multi-channel escalation**,
**multilingual + accessible**, a **court-showable compliance record**, and a
**payer model that doesn't tax the person on probation.**

## 9. Risks & how we hold them

- **IVR fragility (highest operational risk).** Phone menus change. Mitigation:
  per-facility scripts maintained centrally (fix once, all users benefit),
  automated "the menu doesn't match what we expected" detection that **fails to
  the safe fallback** ("call it yourself") and alerts an operator.
- **Being wrong in the dangerous direction.** Mitigation: asymmetric confidence
  thresholds — a high bar to ever say "clear," a low bar to say "verify
  yourself." Human-in-the-loop review for low-confidence transcriptions.
- **Liability.** Mitigation: institutional-partner model, explicit "backup, not a
  replacement for your own responsibility" terms, audit logging, and appropriate
  insurance.
- **Telephony cost & abuse.** Calls cost money; mitigation is the institutional
  payer model and shared calls (many users on one facility line → one call).
- **Trust / stigma.** Mitigation: neutral, non-stigmatizing branding (the product
  name avoids "probation"/"drug"), arrival via a trusted intermediary.
- **Legal review needed** on auto-dialing testing lines, recording/consent laws
  (two-party-consent states), and data handling — before any real-world pilot.

## 10. Naming

"Clearline" is a **provisional** working name (phone *line* + being in the
*clear*). Requirements for the final name: non-stigmatizing (no "probation,"
"drug," "test"), easy to say over the phone to a case manager, available as a
`.org`/`.com`. Alternatives to consider: _Checkpoint, Roll Call, Daylight,
Cadence, On Time_.

---

### One-paragraph summary

Build the reliable check-in tool, structure it as a public-benefit or nonprofit
entity, fund it with reentry grants and institutional contracts, keep it free or
sponsored for individuals, and win by partnering with the supervising agencies —
which simultaneously solves distribution, liability, and trust. The code is
weeks of work; the moat is reliability, the payer model, and the institutional
relationships.
