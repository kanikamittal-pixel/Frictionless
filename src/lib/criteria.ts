import type { BrandProfile, Rubric } from "./engine/types";
import { DIMS } from "./engine/dimensions";
import { LOCATION_LABELS, PARTNER_LABELS } from "./engine/rubric";

// Plain-language description of how every metric is scored. Weights and
// thresholds are read from the live rubric and brand profile, so this always
// matches what the engine does.

export interface Metric {
  key: string;
  label: string;
  group: "partner" | "location";
  weight: number; // % of its group
  points: number; // share of the 100-point total
  what: string; // one-line explanation
  levels: [string, string][]; // condition -> score /10
}

const L = (s: string, v: string): [string, string] => [s, v];

export function metrics(r: Rubric, b: BrandProfile): Metric[] {
  const pw = { ...r.partner };
  if (!b.partnerOperates) {
    const moved = pw.operational / 2;
    pw.operational -= moved;
    pw.financial += moved;
  }
  const P = (k: keyof Rubric["partner"]) => ({ key: k, label: PARTNER_LABELS[k], group: "partner" as const, weight: pw[k], points: +((pw[k] * r.blend.partner) / 100).toFixed(1) });
  const Lc = (k: keyof Rubric["location"]) => ({ key: k, label: LOCATION_LABELS[k], group: "location" as const, weight: r.location[k], points: +((r.location[k] * r.blend.location) / 100).toFixed(1) });
  const cx = b.capexLakh;
  const s = b.sqft;
  return [
    {
      ...P("financial"),
      what: `Can the partner fund the store? Investment is compared with the ${b.industry.toLowerCase()} setup cost for the city tier: ₹${cx["Tier 1"]}L / ₹${cx["Tier 2"]}L / ₹${cx["Tier 3"]}L (Tier 1/2/3).`,
      levels: [L("≥ 1.3× setup cost (has a working-capital buffer)", "10"), L("1.0–1.3×", "7–9"), L("0.75–1.0× — funding gap becomes a condition", "4–6"), L(`${Math.round(r.capitalFloor * 100)}%–75%`, "2–4"), L(`Below ${Math.round(r.capitalFloor * 100)}% — rejected before scoring`, "0"), L("Relies on a loan (from the notes)", "−1")],
    },
    {
      ...Lc("economics"),
      what: "Will the store make money after rent? Capital cover plus whether the space is owned.",
      levels: [L("Capital ≥ 1.3× setup", "9"), L("≥ 1.0×", "7"), L("≥ 0.75×", "5"), L("Less", "3"), L("Owned space (no rent)", "+1"), L("Rented in a Tier 1 city", "−0.5")],
    },
    {
      ...P("floor"),
      what: b.groundCritical ? "Walk-in access. This format needs street-level visibility." : "Walk-in access. Upper floors are acceptable for this format.",
      levels: [L("Ground floor", "10"), L(`Mall unit (${b.mallFit} fit for this category)`, b.mallFit === "good" ? "8" : b.mallFit === "ok" ? "6.5" : "4"), L("Upper floor / basement", b.groundCritical ? "2.5–3.5" : "6.5"), L("No space yet (floor decided later)", "5")],
    },
    {
      ...P("size"),
      what: `Does the space fit the store format? Ideal ${s.idealMin}–${s.idealMax} sq ft; workable ${s.min}–${s.max}.`,
      levels: [L(`${s.idealMin}–${s.idealMax} sq ft`, "10"), L(`${s.min}–${s.max} sq ft`, "7.5"), L("Up to 20% outside that", "5"), L("Far too small or too big", "2"), L("No space yet", "5")],
    },
    {
      ...P("ownership"),
      what: "Who controls the space, and for how long.",
      levels: [L("Owned", "10"), L("Rented", "7"), L("Short-term lease", "4"), L("Not yet identified — caps the decision at Conditional", "3")],
    },
    {
      ...P("operational"),
      what: `Can they run a shop? Years of retail experience, boosted when their business is related to ${b.industry.toLowerCase()}.${b.partnerOperates ? "" : " The brand runs the store, so this counts half."}`,
      levels: [L("0 years", "2"), L("1 · 2 · 3 · 4 years", "5 · 6 · 6.5 · 7"), L("5–9 years", "8"), L("10+ years", "8.5"), L("Same trade / adjacent retail", "+1.5 / +1"), L("Owner not hands-on", "−2")],
    },
    {
      ...P("local"),
      what: "Fit with local customers and staff, averaged with how serious the notes sound.",
      levels: [L("Kannada", "10"), L("English (Tier 1 / other)", "7.5 / 6"), L("Hindi (Tier 1 / other)", "6 / 4"), L("Notes show research · generic · any-brand", "10 · 6.5 · 3")],
    },
    {
      ...Lc("strategic"),
      what: "How much the brand wants this territory now, and how many slots are left.",
      levels: [L("High priority, 2+ slots / 1 slot", "10 / 8.5"), L("Medium, 2+ / 1", "7.5 / 6"), L("Low, 2+ / 1", "4 / 3"), L("Outside the plan (fallback batch)", "2")],
    },
    {
      ...Lc("demographic"),
      what: "Population and spending power, from the city tier and the type of locality.",
      levels: [L("Tier 1 · 2 · 3 base", "8 · 6.5 · 5"), L("CBD / high street", "+1.5"), L("Transit, IT corridor, premium residential", "+1"), L("City fringe / industrial", "−1.5 / −2")],
    },
    {
      ...Lc("jtbd"),
      what: b.footfall === "low" ? "Order density nearby (this format doesn't rely on walk-ins)." : "How strongly the spot triggers a purchase — busy streets, transit, malls.",
      levels: [L("Transit hub, CBD, high street", "9"), L("Mall unit", "8.5"), L("IT corridor · premium residential · residential", "7.5 · 7 · 6"), L("Fringe · industrial", "4 · 3.5"), L(`Notes mention ${b.triggers.slice(0, 3).join(", ")}…`, "+0.75 each")],
    },
    {
      ...Lc("supply"),
      what: "How easily stock reaches the store from the existing network.",
      levels: [L("City already has stores (Bengaluru hub)", "9–10"), L("Nearest store city ≤ 120 km", "8"), L("≤ 250 km", "6.5"), L("Farther", "4.5")],
    },
    {
      ...Lc("competition"),
      what: "Would it eat into one of the brand's own existing stores?",
      levels: [L(`Own store under ${r.saturationKm} km away`, "2"), L("2–4 km", "5"), L("4–7 km", "8"), L("Farther, same city", "9"), L("New city, High priority / other", "9.5 / 7.5")],
    },
    {
      ...Lc("competitors"),
      what: `Other ${b.industry.toLowerCase()} businesses around the pin. A few prove there is demand; none is untested; too many split the customers. Read from the applicant's notes first, then an AI estimate for the pin, then the locality type.`,
      levels: [L("A few (1–3) — demand proven, room to grow", "9.5"), L("None — white space (High-priority territory / other)", "8 / 6.5"), L("Several (4–7) — needs a clear edge", "7"), L("Crowded (8+) — saturated", "3.5"), L("No information", "6.5")],
    },
    {
      ...P("speed"),
      what: `How soon they can open. Realistic lead time is ~${b.leadMonths.withSpace} months with a space, ~${b.leadMonths.withoutSpace} without.`,
      levels: [L("≤ 3 months", "10"), L("4–6", "7"), L("7–9", "4"), L("10+", "3"), L("Faster than realistic (capped)", "≤ 6"), L("Stated deadline", "+0.5")],
    },
  ];
}

export function dimensionsWithMetrics(r: Rubric, b: BrandProfile) {
  const all = metrics(r, b);
  return DIMS.map((d) => {
    const ms = all.filter((m) => (d.factors as readonly string[]).includes(m.key));
    return { key: d.key, label: d.label, points: +ms.reduce((a, m) => a + m.points, 0).toFixed(1), metrics: ms };
  });
}

export const DIM_BLURB: Record<string, string> = {
  money: "Can they pay for it, and will it pay back?",
  site: "Is there a space that fits the format?",
  operator: "Can they run the store day to day?",
  location: "Is this a place the brand wants to be?",
  launch: "How soon can they realistically open?",
};

export function gates(r: Rubric) {
  return [
    ["Data checks", "Blank amount, city/pin mismatch, notes that contradict the form → Hold for one answer."],
    ["Pin already has a store", "Never two stores in one pin → Reject, with nearby open pins suggested."],
    ["Pin outside every territory", "→ Hold on the waitlist (if any application in the batch is inside the plan)."],
    ["No usable slot", "Territory has 0 open slots, or every pin is already served → Reject."],
    ["Capital too low", `Under ${Math.round(r.capitalFloor * 100)}% of the tier setup cost → Reject.`],
  ] as [string, string][];
}

export function bands(r: Rubric) {
  return [
    ["Approve", `Wins a slot and scores ≥ the tier bar (T1 ${r.approveMin["Tier 1"]} · T2 ${r.approveMin["Tier 2"]} · T3 ${r.approveMin["Tier 3"]}), nothing left to close.`],
    ["Conditional", `Wins a slot (score ≥ ${r.conditionalMin}) but has conditions — no space yet, funding gap, relocation. Slot held 60 days.`],
    ["Hold", `Score ${r.rejectBelow}–${r.conditionalMin}, waitlisted behind better partners, outside the plan, or missing data.`],
    ["Reject", `Score under ${r.rejectBelow}, or failed a knockout above.`],
  ] as [string, string][];
}

// ---------------------------------------------------------------------------
// Plain-language version for the Scoring tab: one row per metric, in everyday
// words — what we look at, points, what earns full marks, what scores low.

export interface SimpleRow {
  key: string;
  area: string; // the dimension it belongs to
  what: string;
  points: number;
  full: string;
  low: string;
}

export function simpleRows(r: Rubric, b: BrandProfile): SimpleRow[] {
  const pts = Object.fromEntries(metrics(r, b).map((m) => [m.key, m.points]));
  const s = b.sqft;
  const row = (key: string, area: string, what: string, full: string, low: string): SimpleRow => ({ key, area, what, points: pts[key], full, low });
  return [
    row("financial", "Money", "Money the partner can invest", "At least 1.3× the setup cost for that city tier", "Less than 75% of the setup cost (under 50% is rejected)"),
    row("economics", "Money", "Can the store pay its rent", "Owns the space and has enough money", "Little money and paying rent"),
    row("floor", "Site", "Which floor the shop is on", b.groundCritical ? "Ground floor facing the street" : "Ground floor or a mall unit", b.groundCritical ? "Upper floor or basement" : "Basement"),
    row("size", "Site", "Size of the shop", `${s.idealMin}–${s.idealMax} sq ft`, `Far smaller than ${s.min} or bigger than ${s.max} sq ft`),
    row("ownership", "Site", "Does the partner have a shop", "Owns it", "No shop found yet"),
    row("operational", "Operator", "Experience running a shop", "5+ years, in the same or a similar trade", "No experience"),
    row("local", "Operator", "Fit with local customers", "Speaks Kannada and has researched the brand", "Only Hindi in a smaller city, generic application"),
    row("strategic", "Location", "How much the brand wants this area", "High-priority territory with 2+ slots", "Low priority, or outside the expansion plan"),
    row("demographic", "Location", "Number of people and spending power nearby", "Tier 1 city centre or busy high street", "Tier 3 city edge or industrial area"),
    row("jtbd", "Location", "Reasons for people to walk in", "Near a bus stand, market, mall, hospital or college", "Quiet street with nothing nearby"),
    row("supply", "Location", "How easily stock can reach it", "City already has a store", "More than 250 km from the nearest store"),
    row("competition", "Location", "Would it steal sales from our own store", "No own store within 7 km, or a new city", "Own store within 2 km"),
    row("competitors", "Location", "Other brands' shops nearby", "A few (1–3) — shows people buy here", "Crowded with 8+ — customers already split"),
    row("speed", "Launch", "How soon they can open", "Within 3 months, and realistic", "More than 10 months away"),
  ];
}

export const TIER_CITIES: Record<string, string> = {
  "Tier 1": "Bengaluru",
  "Tier 2": "Mysuru, Mangaluru, Hubballi-Dharwad, Belagavi",
  "Tier 3": "Tumakuru, Davanagere",
};
