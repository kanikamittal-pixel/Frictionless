import type { BrandProfile, Result } from "./types";

// The onboarding skeleton is computed, not written by the AI: dates, owners
// and gates come from the decision, the space status and the brand profile.
// The AI only rewrites it in the partner's language.

export type Phase = "Before signing" | "Set up" | "Train" | "Open" | "Next step";

/** Not in the sheets and not scored — checked by the team in the partner interview. */
export const INTERVIEW_CHECKS = ["Proof of liquid funds and net worth", "Credit check and financing backup", "People-management experience", "Local market knowledge", "Brand fit and willingness to follow the system", "Coachability"];

export interface PlanStep {
  day: number;
  date: string;
  title: string;
  detail: string;
  owner: "Partner" | "Brand" | "Both";
  phase: Phase;
  gate?: boolean;
}

export interface Plan {
  steps: PlanStep[];
  openDay: number;
  openDate: string;
  targetDate: string | null;
  feasible: boolean;
  note: string;
  trainingDays: number;
}

const FESTIVALS: { name: RegExp; label: string; dates: string[] }[] = [
  { name: /diwali|deepavali/i, label: "Diwali", dates: ["2026-11-08", "2027-10-29"] },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);
export const fmtDate = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function buildPlan(r: Result, brand: BrandProfile, today = new Date()): Plan {
  const at = (day: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + Math.round(day));
    return iso(d);
  };
  const steps: PlanStep[] = [];
  const add = (day: number, s: Omit<PlanStep, "day" | "date">) => steps.push({ day: Math.round(day), date: at(day), ...s });
  const a = r.app;
  const lang = a.language ?? "English";
  const trainingDays = brand.training.reduce((x, t) => x + t.days, 0);

  if (r.decision === "Reject" || r.decision === "Hold") {
    if (r.decision === "Hold") {
      if (r.slot === "waitlist" || r.slot === "lost-pin") {
        add(2, { phase: "Next step", owner: "Brand", title: "Tell the partner they are next in line", detail: `Call in ${lang}: ${r.headline}` });
        if (r.alternatives.length) add(5, { phase: "Next step", owner: "Both", title: "Offer an open pin instead", detail: `Open slots remain at ${r.alternatives.map((x) => `${x.pin} (${x.territory}, ${x.locality})`).join("; ")}.` });
        add(30, { phase: "Next step", owner: "Brand", title: "Re-check the slot", detail: "If an approved partner misses their conditions, this partner moves up automatically." });
      } else {
        add(2, { phase: "Next step", owner: "Brand", title: "Ask for the missing or conflicting details", detail: r.issues.filter((i) => i.severity !== "info").map((i) => i.message).join(" ") || r.headline });
        add(7, { phase: "Next step", owner: "Brand", title: "Re-run the decision", detail: "Type the new information into Frictionless; the decision updates for this partner and anyone competing with them." });
      }
    } else {
      add(3, { phase: "Next step", owner: "Brand", title: `Send a respectful decline in ${lang}`, detail: r.headline });
      if (r.alternatives.length) add(5, { phase: "Next step", owner: "Both", title: "Suggest a pin that is open", detail: r.alternatives.map((x) => `${x.pin} (${x.territory})`).join(", ") });
      if (r.paths.length) add(7, { phase: "Next step", owner: "Partner", title: "What would change the answer", detail: r.paths.map((p) => `${p.label} → ${p.becomes}`).join("; ") });
    }
    return { steps, openDay: 0, openDate: "", targetDate: null, feasible: false, note: "", trainingDays };
  }

  // Approve / Conditional: a real launch plan.
  let d = 0;
  const conditionDue: Record<string, number> = { "confirm-notes": 7, "confirm-floor": 7, "find-space": 60, "funding-gap": 30, relocate: 45, "relocate-pin": 30, resize: 45, format: 14, "confirm-size": 7, confirm: 7, manager: 21, timeline: 3, territory: 21, "existing-shop": 21 };
  const gates = r.conditions.filter((c) => c.code !== "below-bar");
  for (const c of gates) add(conditionDue[c.code] ?? 14, { phase: "Before signing", owner: c.code === "territory" ? "Brand" : "Partner", title: c.text, detail: "Must be closed before the agreement is signed.", gate: true });
  const gateEnd = gates.length ? Math.max(...gates.map((c) => conditionDue[c.code] ?? 14)) : 0;

  add(5, { phase: "Set up", owner: "Brand", title: `Offer letter and LOI in ${lang}`, detail: `Partner pays a refundable token. Slot ${r.territoryId ?? ""} pin ${a.pin} is held${r.nextInLine ? `; ${r.nextInLine} is next in line if this lapses` : ""}.` });
  add(10, { phase: "Set up", owner: "Partner", title: "KYC and proof of funds", detail: `Bank statement or sanction letter for ₹${r.payback?.capex ?? ""} lakh setup cost.` });
  const hasSpace = a.space === "Owned" || a.space === "Rented";
  d = Math.max(hasSpace ? 14 : 60, gateEnd);
  add(d, { phase: "Set up", owner: "Brand", title: hasSpace ? "Site audit and layout sign-off" : "Site shortlist approved", detail: `${brand.groundCritical ? "Ground floor, " : ""}${brand.sqft.idealMin}–${brand.sqft.idealMax} sq ft, frontage and signage checked.` });
  d += 7;
  add(d, { phase: "Set up", owner: "Both", title: "Franchise agreement signed, fee paid", detail: "Territory exclusivity for the pin is recorded.", gate: true });
  const agreement = d;
  const size = a.size ?? brand.sqft.idealMax;
  const fitWeeks = brand.modelKey === "micro" || brand.modelKey === "sis" ? 2 : size <= 600 ? 5 : size <= 1200 ? 7 : 9;
  add(agreement + 3, { phase: "Set up", owner: "Brand", title: `Fit-out starts (${fitWeeks} weeks)`, detail: "Brand design team issues drawings; partner's contractor builds to spec." });
  add(agreement + 21, { phase: "Set up", owner: "Partner", title: "Licences in hand", detail: brand.licences.join(", ") + "." });
  const fitEnd = agreement + 3 + fitWeeks * 7;
  add(fitEnd - 21, { phase: "Train", owner: "Partner", title: `Hire ${brand.staff} staff`, detail: "Brand HR shares job descriptions and screens shortlisted candidates." });
  const buddy = r.buddyStore ? `${r.buddyStore.id} (${r.buddyStore.city}, ~${r.buddyStore.km} km)` : "the nearest store";
  add(fitEnd - 3 - trainingDays, { phase: "Train", owner: "Both", title: `Owner training at ${buddy} — ${trainingDays} days in ${lang}`, detail: brand.training.map((t) => `${t.title} (${t.days}d)`).join(" · ") });
  add(fitEnd - 5, { phase: "Train", owner: "Brand", title: `Staff training in ${lang}`, detail: "On-site, using the store's own fixtures and point of sale." });
  add(fitEnd - 4, { phase: "Open", owner: "Brand", title: "Stock, point of sale and systems go live", detail: "Opening inventory delivered; dry-run of billing and returns." });
  const soft = fitEnd + 2;
  const target = a.launch ? Math.round(a.launch * 30.4) : null;
  const open = Math.max(soft + 7, target ?? 0);
  add(soft, { phase: "Open", owner: "Both", title: "Soft launch", detail: "Friends-and-family week; brand area manager on site." });
  add(open, { phase: "Open", owner: "Both", title: "Grand opening", detail: `Local launch campaign in ${lang === "English" ? "English and Kannada" : lang}.` });
  add(open + 30, { phase: "Open", owner: "Brand", title: "30-day review and \"ready to run alone\" sign-off", detail: "Footfall, conversion, staff readiness; area manager signs off independent running." });
  add(open + 90, { phase: "Open", owner: "Brand", title: "90-day review", detail: r.conditions.some((c) => c.code === "below-bar") ? "Probation review for a below-bar approval: continue, coach, or exit." : "Sales against plan; payback on track?" });

  steps.sort((x, y) => x.day - y.day);
  const feasible = target === null || soft + 7 <= target;
  let note = target === null ? "" : feasible ? `Fits the partner's ${a.launch}-month target.` : `The ${a.launch}-month target is too tight; the realistic opening is ${fmtDate(at(open))}.`;
  if (r.payback?.months) note += ` Indicative payback ≈ ${r.payback.months} months (₹${r.payback.capex}L setup, ~₹${r.payback.monthlyProfit}L/month operating profit).`;
  const deadline = `${a.notes} ${a.business}`;
  for (const f of FESTIVALS)
    if (f.name.test(deadline)) {
      const next = f.dates.find((x) => x >= at(0));
      if (next) note += ` Asked to open before ${f.label}: ${fmtDate(next)} is ${next >= at(open) ? "achievable" : "not achievable on this plan"}.`;
    }
  return { steps, openDay: open, openDate: at(open), targetDate: target ? at(target) : null, feasible, note: note.trim(), trainingDays };
}
