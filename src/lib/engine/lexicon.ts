import type { Application, BrandProfile, Fills, TextTags } from "./types";
import * as N from "./normalize";

// Rule-based reader for the free-text columns. It is the fallback when the AI
// is slow or down, so it errs on the side of flagging for a human.

const has = (s: string, re: RegExp) => re.test(s);

/** `updated` = fields the team has corrected since upload; the notes are older than those, so they can't contradict them. */
export function ruleTags(app: Application, brand: BrandProfile, updated: Set<string> = new Set()): TextTags {
  const biz = app.business.toLowerCase();
  const notes = app.notes.toLowerCase();
  const all = `${biz} ${notes}`;

  const hit = (words: string[]) => words.find((w) => w && all.includes(w));
  const direct = hit(brand.relevantWords);
  const adj = hit(brand.adjacentWords);
  let relevance: TextTags["relevance"] = "none";
  if (direct) relevance = "direct";
  else if (adj) relevance = "adjacent";
  else if (biz.trim()) relevance = "unrelated";

  const category = app.business ? app.business.split(/[,.;]/)[0].slice(0, 40) : "Not stated";

  let urgency: TextTags["urgency"] = "normal";
  let deadline: string | undefined;
  const dl = notes.match(/before ([a-z ]{3,25}?)(?:[.,;]|$)/);
  if (has(notes, /diwali|deepavali|dasara|dussehra|ugadi|sankranti|festive|festival|asap|urgent|immediately|quick|this month|next month/) || dl) {
    urgency = "high";
    deadline = dl ? `before ${dl[1].trim()}` : (notes.match(/diwali|deepavali|dasara|dussehra|ugadi|sankranti/)?.[0] ?? undefined);
  } else if (has(notes, /no hurry|next year|later|someday|exploring|just enquir|not sure when/)) urgency = "low";

  let intent: TextTags["intent"] = "generic";
  if (has(notes, /visited|research|studied|spoke to|met (the|your)|customer of|loyal|know the brand|footfall|survey|competitor|catchment|business plan|big fan/)) intent = "strong";
  if (notes.length < 12 || has(notes, /any brand|any franchise|many franchise|several brands|exploring options|just checking|whichever/)) intent = "weak";

  const redFlags: string[] = [];
  if (has(all, /loan|borrow|need fund|financ(e|ing) needed|emi|mortgage/)) redFlags.push("Funding depends on a loan");
  if (has(all, /dispute|court|legal case|litigation|case pending|family issue/)) redFlags.push("Possible legal or ownership dispute");
  if (has(all, /part[- ]time|weekends only|full[- ]time job|working abroad|\bnri\b|will not be present|manager will run|absentee/)) redFlags.push("Owner may not be hands-on");
  if (has(all, /other franchise|another franchise|competing brand|already a franchisee/)) redFlags.push("Runs another franchise — check non-compete");
  if (has(all, /short[- ]term|temporary|lease ends|lease expir|11[- ]month/)) redFlags.push("Short-term lease");
  if (has(all, /under construction|not ready|renovation|being built/)) redFlags.push("Space not ready yet");
  if (has(all, /closed|shut down|loss|bankrupt|failed/)) redFlags.push("Past business closed or made losses");

  const positives: string[] = [];
  if (has(all, /own(s)? the (building|property|shop)|family property|ancestral|our own building/)) positives.push("Owns the property");
  if (has(all, /local|born|grew up|lived here|community|well known|network/)) positives.push("Strong local roots");
  if (has(all, /customer base|loyal customers|regular customers/)) positives.push("Existing customer base");
  if (has(all, /\d+ (stores|shops|outlets)|chain|multiple (stores|shops)/)) positives.push("Has run more than one outlet");
  if (has(all, /mba|manager at|worked (at|with|for)|ex-/)) positives.push("Relevant management background");

  const cues = new Set<string>();
  const cueRe = /(main road|bus stand|bus stop|metro|railway station|market|mall|college|hospital|clinic|school|temple|junction|circle|highway|it park|tech park|apartment|layout)/g;
  for (const m of all.matchAll(cueRe)) cues.add(m[1]);

  const contradictions: string[] = [];
  const c = (field: string, cond: boolean, msg: string) => {
    if (cond && !updated.has(field)) contradictions.push(msg);
  };
  c("floor", app.floor === "Ground" && has(notes, /first floor|1st floor|second floor|upper floor|basement/), "Notes mention an upper floor or basement, but Floor says Ground");
  c("floor", app.floor !== "Mall unit" && has(notes, /inside (a |the )?mall|mall unit/), "Notes mention a mall unit, but Floor does not");
  c("space", app.space === "Rented" && has(notes, /own (shop|building|property)|our own|family property/), "Notes say the space is owned, but Space says Rented");
  c("space", app.space === "Owned" && has(notes, /\brent(ed)?\b|lease/), "Notes mention rent or lease, but Space says Owned");
  c("space", (app.space === "Owned" || app.space === "Rented") && has(notes, /looking for (a )?(shop|space)|no shop|yet to find|searching for/), "Notes say they are still looking for a space");
  c("experience", (app.experience ?? 0) > 0 && has(all, /no experience|never (run|worked)|fresher/), "Text says no experience, but experience years > 0");
  c("experience", (app.experience ?? 0) === 0 && !!direct && has(biz, /runs|running|own|manag/), "Runs a related business today, but experience is 0 years");
  c("size", app.space === "Not yet identified" && (app.size ?? 0) > 0, "Space size is filled in although no space is identified");

  return { category, relevance, urgency, deadline, intent, redFlags, positives, locationCues: [...cues], contradictions, fills: ruleFills(app), source: "rules" };
}

/** Values stated in the free text for cells that were left blank in the sheet. */
export function ruleFills(app: Application): Fills {
  const t = `${app.business} ${app.notes}`.toLowerCase();
  const f: Fills = {};
  if (app.size === null) {
    const m = t.replace(/(\d),(\d)/g, "$1$2").match(/(\d{2,5})\s*(?:sq\.?\s*(?:ft|feet)|sqft|sft|square\s*f(?:ee|oo)t)/);
    if (m) f.size = +m[1];
  }
  if (app.floor === null || app.floor === "Not known") {
    if (/\b(ground[- ]floor|gf shop|street[- ]facing|road[- ]facing)\b/.test(t)) f.floor = "Ground";
    else if (/\b(first|1st|second|2nd|upper)[- ]floor\b/.test(t)) f.floor = "Upper";
    else if (/\b(in|inside) (a |the )?mall\b|mall unit/.test(t)) f.floor = "Mall unit";
  }
  if (app.space === null) {
    const sp = N.space(app.notes);
    if (sp.value) f.space = sp.value;
  }
  if (app.investment === null) {
    const m = t.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(lakh|lakhs|lac|l\b|cr|crore)/);
    if (m && /invest|capital|fund|budget|arrange|ready|have/.test(t)) {
      const n = N.investment(`${m[1]} ${m[2]}`).value;
      if (n) f.investment = n;
    }
  }
  if (app.launch === null) {
    const m = t.match(/(?:open|launch|start)\w*\s+(?:in|within)\s+(\d+)\s*months?/);
    if (m) f.launch = +m[1];
  }
  if (app.experience === null) {
    const m = t.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\b/);
    if (m && /run|manag|experience|shop|store|business/.test(t)) f.experience = +m[1];
  }
  return f;
}

export const SEVERE_FLAG = /dispute|legal|court|fraud|litigation/i;
