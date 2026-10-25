# Frictionless — franchise partner engine

Mesa Ops Hackathon, Case 1 (Franchise Partner Acquisition, Geo-Selection & Onboarding).

The team picks the brand's **industry** and **business model**, then uploads the Excel (Sheet 1 Applications, Sheet 2 Territories; Sheet 3 existing stores is built in). Every partner gets **Approve / Conditional / Hold / Reject**, along with:
- the reason,
- the conditions to close,
- who they competed with,
- a simulated "path to yes",
- an onboarding plan with dates, written in the partner's language.

You can then ask "Why is APP-007 on hold?" or give new information ("APP-012 found a ground-floor space"). The app shows the before/after for everyone affected, and you confirm before anything is applied.

## Run locally

```bash
npm install
scripts/local-db.sh start          # optional: throwaway Postgres on :5546
npm run dev                        # http://localhost:3000
```

`.env.local`:

| Var | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | Gemini Flash via OpenRouter (tagging, explanations, chat, pattern finder) |
| `AI_MODEL`, `AI_MODEL_FAST`, `AI_MODEL_FALLBACK` | defaults: `google/gemini-3.7-flash`, `google/gemini-3.6-flash`, `google/gemini-3.5-flash-lite` |
| `DATABASE_URL` | optional Postgres (Neon in prod). Tables are created on first use. |

Without the AI key, the app still decides everything: a rule-based reader and a rule-based chat take over. Without the database, batches live only in the visitor's browser.

`public/sample/Frictionless_Sample_Batch.xlsx` is a 28-row batch seeded with the brief's edge cases. Regenerate it with `npx tsx scripts/make-sample.ts`. `npx tsx scripts/try-engine.ts [file] [industry] [model]` prints every decision from the command line.

## How it decides

```
Excel ──parse (by headers, not sheet names)──► normalise cells ──► AI text tags (fallback: rules)
                                                              │
brand profile (industry × model) ─► setup cost, ideal size,   ▼
                                    relevant trades, training   ENGINE (deterministic, src/lib/engine/run.ts)
rubric vN (versioned, DB) ───────────────────────────────────►  1 hard checks: same pin as a store · territory gate
                                                                   (strict / fallback) · no usable slot · capital < 50%
                                                                2 100-pt score = partner rubric ⊕ location rubric
                                                                3 one store per pin → best score per slot →
                                                                   pin-losers re-scored on free pins in-territory
                                                                4 decision + conditions + path-to-yes simulations
                                                              │
                         AI explains (never re-scores) ◄──────┘──► onboarding plan (computed dates, AI translation)
chat / form edits ─► append-only change log ─► re-run + diff (knock-on effects) ─► team applies
Insights across batches + recorded outcomes ─► pattern finder ─► rubric draft ─► team approves vN+1
```

Key files: `src/lib/engine/` (types, reference data, brand presets, normaliser, parser, rules tagger, engine, patch/diff, plan), `src/app/api/` (AI and storage routes), `src/components/` (UI, styled after the Courtney theme).

## Messy sheets

Free-text and number cells are read, not rejected. Examples it handles:
- IDs: "app 7", "APP_07" → APP-007
- Amounts: "Rs 25,00,000", "1.2 cr", "30-35"
- Durations: "8+", "fresher", "6 months", "Jan 2027", "ASAP", "before Diwali"
- Space: "Yes - rented", "own building (not mortgaged)", "Rented (owner is my uncle)"
- Floor: "GF", "basement"
- Language and cities: "ಕನ್ನಡ", "Kannada / English", "B'lore", "Tumkur"
- Pins and territories: "570 001 & 570002 / 570008", "572101-03", "Tier-II", "P1"

When a cell is blank but the notes state it (e.g. "our 520 sq ft ground-floor shop"), the value is read from the notes. It is marked as such and confirmed before signing.

## Deliberate choices

- **The AI never decides.** It tags free text, places unmapped pins (labelled "AI estimate"), explains, translates, and turns chat into edits. All scores and decisions come from code, so the same file always gives the same answer.
- **From the rubric docs, adopted:**
  - Knockouts run before scoring. A pin outside every territory, or outside the seven cities, goes to **Hold (waitlist)**, not Reject.
  - Clear notes-vs-form conflicts go to Hold, quoting the notes.
  - No space yet caps a partner at Conditional, with the slot reserved for 60 days.
  - Ties break on capital, then site, then the sooner launch, then ID.
  - Five display dimensions: Money, Site readiness, Operator, Location fit, Launch realism.
  - Capital is shown against the tier minimum and the batch median. Eyewear minimums are Lenskart's ₹35L / ₹25L / ₹20L, with a 250–600 sq ft space.
  - Onboarding plan in Before signing / Set up / Train / Open phases, plus a "ready to run alone" sign-off and an interview checklist (not scored).
  - Upgrades from Reject are tagged "team to confirm".
- **Kept from the original rubrics:** the 50% capital floor (between 50% and 100% is a funding-gap condition, not a decline) and language in the score.
- **Data problems → Hold, not Reject.** A blank investment or a city/pin conflict costs the partner one question, not their application.
- **A strong runner-up for a pin isn't thrown away.** They're re-scored on a free pin in the same territory, and only take a slot if they still outrank the others.
- **Usable slots = min(open slots, pins without a store).** Belagavi in the sample has 2 slots and one pin that is already served, so it has 0 usable slots, and the app suggests the pins applicants actually asked for.
