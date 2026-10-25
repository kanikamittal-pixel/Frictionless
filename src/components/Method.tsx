"use client";
import { useStore } from "@/lib/store";


const STAGES = [
  ["Trigger", "The team picks the brand's industry and business model, then uploads Sheets 1 and 2. Sheet 3 (existing stores) is built in.", "Team"],
  ["Input", "Sheets are found by their headers, not their names. Every cell is normalised: ₹ in rupees, '15 lakh', 'ASAP', blank floors. The AI reads the free text into tags: relevance, urgency, red flags, contradictions.", "App + AI"],
  ["Context", "Pin code → territory, open slots, pins already served by a store, locality type, distance to the nearest store and supply route. The brand profile sets space size, setup cost per tier, and what counts as relevant experience.", "App"],
  ["Processing", "1 · Data checks (missing amount, city/pin conflict, notes that contradict the form → Hold for one answer). 2 · Knockouts: same pin as an existing store → Reject; pin outside every territory → Hold (waitlist); no usable slot; capital under 50% of the tier minimum. 3 · 100-point rubric shown as five dimensions (Money, Site readiness, Operator, Location fit, Launch realism). 4 · One store per pin; the best score wins each slot, and a strong partner who loses a pin is offered a free pin in the same territory.", "Engine"],
  ["Output", "Approve, Conditional, Hold or Reject — with the reason, the conditions, the competing partner, a 'path to yes', and an onboarding plan with dates in the partner's language.", "Engine + AI"],
  ["Feedback", "Ask why in plain language, or give new information. Every change is previewed (including knock-on effects on rivals) before it is applied, and logged.", "Team + AI"],
  ["Improve", "Insights across all batches and recorded store outcomes; the pattern finder proposes new weights; the team approves a new rubric version, which the next upload uses.", "Team + AI"],
];

const EDGE = [
  "Pin already has an existing store → rejected under the one-store-per-pin rule, with the nearest open pin suggested.",
  "Two or more applicants on one pin → best score keeps it; the runner-up is re-scored on a free pin in the same territory and only takes a slot if it still outranks the others.",
  "More open slots than free pins → usable slots are capped (e.g. Belagavi: 2 slots, 1 pin, already served = 0).",
  "Pin listed in two territories → counted once, for the higher-priority territory, and flagged.",
  "Territory tier that contradicts the allowed values → the official tier is used and flagged.",
  "Pin outside every territory → Hold, kept on the waitlist (not rejected): the brand may add that pin later.",
  "Blank cell but the notes state it ('our 520 sq ft ground-floor shop') → value read from the notes, marked, and confirmed before signing.",
  "No space yet → capped at Conditional, with the slot reserved for 60 days while the partner finds one.",
  "No application matches any territory → Phase 1 fallback: nobody is hard-rejected, everyone is flagged 'Not a preferred location for company' and penalised.",
  "City and pin disagree (Mysuru with a 560xxx pin) → Hold with the exact question, never a reject on a location the applicant may not mean.",
  "Investment typed in rupees (28,00,000) or words ('15 lakh', '1.2 cr') → converted and noted.",
  "Blank investment, space status or pin → Hold for that one answer; the 'path to yes' shows what the decision becomes once it arrives.",
  "Space 'not yet identified' with a 2-month launch → launch reset to the realistic lead time.",
  "Notes contradict the form (says first floor, form says Ground) → condition to confirm; corrected automatically when the fact is updated.",
  "Duplicate applicant (same name and pin) → held for merge, never given a second slot.",
  "Legal or ownership dispute in the notes → Hold to verify. The AI can only raise flags; it can never reject.",
  "Approved partner withdraws → slot frees, and the next in line moves up on the next run.",
  "Missing Application ID → labelled by sheet row so it can still be discussed.",
];

export default function Method() {
  const brand = useStore((s) => s.brand);
  const rubric = useStore((s) => s.rubric);
  return (
    <>
      <p className="eyebrow muted">Transparency</p>
      <h1 className="h-page" style={{ marginTop: 8 }}>
        How Outpost decides
      </h1>
      <p className="lede" style={{ marginTop: 10 }}>
        The decision is made by a deterministic engine — same inputs, same answer, every time. The AI reads messy text and explains decisions; it never changes a score.
      </p>

      <div className="stack" style={{ marginTop: 30 }}>
        {STAGES.map(([t, d, who], i) => (
          <div key={t} className="card white" style={{ display: "grid", gridTemplateColumns: "56px 1fr auto", gap: 18, alignItems: "start" }}>
            <span className="mono" style={{ fontSize: 12, color: i === 3 ? "var(--accent)" : "var(--muted)", paddingTop: 4 }}>[{String(i + 1).padStart(2, "0")}]</span>
            <div>
              <b style={{ fontSize: 17 }}>{t}</b>
              <p className="small muted" style={{ marginTop: 4 }}>
                {d}
              </p>
            </div>
            <span className="tag">{who}</span>
          </div>
        ))}
      </div>

      <h3 className="section-h">The 100 points</h3>
      <div className="grid g2">
        <div className="card">
          <p className="eyebrow">Partner fit · {rubric.blend.partner}%</p>
          <p className="small" style={{ marginTop: 8 }}>
            Floor {rubric.partner.floor} · size {rubric.partner.size} · ownership {rubric.partner.ownership} · financial readiness {rubric.partner.financial} · operating experience {rubric.partner.operational} · speed {rubric.partner.speed} · local nuance {rubric.partner.local}
          </p>
          <p className="xs muted" style={{ marginTop: 8 }}>
            For this brand: ideal space {brand.sqft.idealMin}–{brand.sqft.idealMax} sq ft; capital is compared with ₹{brand.capexLakh["Tier 1"]}L / ₹{brand.capexLakh["Tier 2"]}L / ₹{brand.capexLakh["Tier 3"]}L setup cost (≥130% = full marks); {brand.partnerOperates ? "partner runs the store" : "the brand runs the store, so experience counts half"}.
          </p>
        </div>
        <div className="card">
          <p className="eyebrow">Location fit · {rubric.blend.location}%</p>
          <p className="small" style={{ marginTop: 8 }}>
            Strategic fit {rubric.location.strategic} · demographics {rubric.location.demographic} · purchase triggers {rubric.location.jtbd} · supply chain {rubric.location.supply} · real-estate economics {rubric.location.economics} · own-store overlap {rubric.location.competition} · competitors nearby {rubric.location.competitors}
          </p>
          <p className="xs muted" style={{ marginTop: 8 }}>
            Approve needs Tier 1 ≥ {rubric.approveMin["Tier 1"]}, Tier 2 ≥ {rubric.approveMin["Tier 2"]}, Tier 3 ≥ {rubric.approveMin["Tier 3"]}. Slot-eligible from {rubric.conditionalMin}; reject below {rubric.rejectBelow}.
          </p>
        </div>
      </div>

      <h3 className="section-h">Edge cases it handles</h3>
      <div className="card white">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {EDGE.map((e) => (
            <li key={e} className="small" style={{ marginTop: 8 }}>
              {e}
            </li>
          ))}
        </ul>
      </div>

      <h3 className="section-h">Honest limits</h3>
      <div className="card">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li className="small">No store performance data: Sheet 3 has no sales or payback, so existing stores are assumed healthy.</li>
          <li className="small" style={{ marginTop: 8 }}>Locality types come from a built-in map of ~60 well-known pins; others use an AI estimate (labelled) or the city baseline. Distances are approximate.</li>
          <li className="small" style={{ marginTop: 8 }}>Setup cost, revenue and margin are category benchmarks per tier, so payback is indicative. The team can tune them on the first screen.</li>
          <li className="small" style={{ marginTop: 8 }}>No competitor list is uploaded, so &ldquo;competitors nearby&rdquo; comes from the applicant&apos;s notes when they mention it, otherwise an AI estimate for the pin (labelled), otherwise the locality type.</li>
          <li className="small" style={{ marginTop: 8 }}>Built with Claude Code; it is not used while the app runs. Runtime AI is Gemini Flash.</li>
        </ul>
      </div>
    </>
  );
}
