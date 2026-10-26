import type { AiSignals, Application, BrandProfile, Fills, TextTags } from "./types";
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

  const sig = ruleSignals(app);
  const redFlags: string[] = [];
  if (sig.loan && !sig.loanSanctioned) redFlags.push("Funding depends on a loan");
  if (affirmed(all, /dispute|court|legal case|litigation|case pending|family issue/)) redFlags.push("Possible legal or ownership dispute");
  // "Training on weekends only" is a schedule preference, not an absent owner.
  if (has(all, /part[- ]time|full[- ]time job|working abroad|\bnri\b|will not be present|manager will run|absentee/)) redFlags.push("Owner may not be hands-on");
  if (sig.competitorFranchise) redFlags.push("Runs another franchise — check non-compete");
  if (sig.proxy) redFlags.push("Someone other than the applicant will run the store");
  if (sig.partnership) redFlags.push("Partnership — operating partner not named");
  if (sig.influence) redFlags.push("Claims insider influence — ignored for the decision");
  if (sig.injection) redFlags.push("Notes contain instructions to the system — ignored");
  if (sig.family) redFlags.push("A family member also applied — check funds aren't counted twice");
  if (sig.siteReady < 0) redFlags.push("Space not finalised yet");
  if (sig.coInvestor) redFlags.push(`₹${sig.coInvestor.amount}L comes from a ${sig.coInvestor.from} — proof of funds needed`);
  if (affirmed(all, /short[- ]term|temporary|lease ends|lease expir|11[- ]month/)) redFlags.push("Short-term lease");
  if (has(all, /under construction|not ready|renovation|being built/)) redFlags.push("Space not ready yet");
  if (affirmed(all, /closed|shut down|loss|bankrupt|failed/)) redFlags.push("Past business closed or made losses");

  const positives: string[] = [];
  if (has(all, /own(s)? the (building|property|shop)|family property|ancestral|our own building/)) positives.push("Owns the property");
  if (has(all, /local|born|grew up|lived here|community|well known|network/)) positives.push("Strong local roots");
  if (has(all, /customer base|loyal customers|regular customers/)) positives.push("Existing customer base");
  if (has(all, /\d+ (stores|shops|outlets)|chain|multiple (stores|shops)/)) positives.push("Has run more than one outlet");
  if (has(all, /mba|manager at|worked (at|with|for)|ex-/)) positives.push("Relevant management background");
  if (sig.siteReady > 0) positives.push("Space ready to start");

  const cues = new Set<string>();
  const cueRe = /(main road|bus stand|bus stop|metro|railway station|market|mall|college|hospital|clinic|school|temple|junction|circle|highway|it park|tech park|apartment|layout)/g;
  for (const m of all.matchAll(cueRe)) cues.add(m[1]);

  const contradictions: string[] = [];
  const c = (field: string, cond: boolean, msg: string) => {
    if (cond && !updated.has(field)) contradictions.push(msg);
  };
  c("floor", app.floor === "Ground" && affirmed(notes.normalize("NFC"), UPPER_FLOOR), "Notes mention an upper floor or basement, but Floor says Ground");
  c("floor", app.floor !== "Mall unit" && affirmed(notes, /inside (a |the )?mall|mall unit/), "Notes mention a mall unit, but Floor does not");
  c("space", app.space === "Rented" && affirmed(notes, /own (shop|building|property)|our own|family property/), "Notes say the space is owned, but Space says Rented");
  // Word boundaries matter: "please" contains "lease".
  // "Owner hasn't agreed to rent it to me" is a real conflict, so only a negation right before the word cancels it.
  c("space", app.space === "Owned" && has(notes, /\brent(ed|al)?\b|\blease[ds]?\b/) && !/\b(not|no|never|don'?t|doesn'?t)\s+(rent|rented|renting|lease|leased|paying rent)\b|rent[- ]free/.test(notes), "Notes mention rent or lease, but Space says Owned");
  c("space", (app.space === "Owned" || app.space === "Rented") && affirmed(notes, /looking for (a )?(shop|space)|no shop|yet to find|searching for/), "Notes say they are still looking for a space");
  c("space", app.space === "Not yet identified" && affirmed(notes, /already (have|has|got|own)\b.{0,40}\b(shop|space|store|unit)/), "Notes say they already have a shop, but Space says Not yet identified");
  const noExp = all.match(/no experience|never (run|worked)|fresher|\bfresh\b.{0,12}graduate|no business yet/);
  c("experience", (app.experience ?? 0) > 0 && !!noExp, `Text says "${noExp?.[0]}", but Retail experience says ${app.experience} years`);
  const yrs = all.match(/(\d+)\s*\+?\s*(?:years?|yrs?)\b/);
  const textYears = yrs && /\b(run|ran|running|manag|shop|store|business|bizness)/.test(all) ? +yrs[1] : null;
  // Only when the text claims more: "5 years in eyewear" fits inside 12 years of total retail.
  if (textYears !== null && app.experience !== null && textYears - app.experience >= 3)
    c("experience", true, `${SOFT} Text mentions ${textYears}${/\d+\s*\+/.test(yrs![0]) ? "+" : ""} years in business, but Retail experience says ${app.experience}`);
  else c("experience", (app.experience ?? 0) === 0 && !!direct && has(biz, /runs|running|own|manag/), "Runs a related business today, but experience is 0 years");
  // "I can only arrange 10 lakh" against a bigger number in the form: the money may not be there.
  const lessMoney = notes.match(/\bcan only (?:arrange|afford|invest|put in|manage)\s+(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)\s*(?:lakhs?|lac|l\b)|\b(?:only|just)\s+(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)\s*(?:lakhs?|lac|l\b)\s*(?:available|in hand|ready|right now|for now)/);
  const lessN = lessMoney ? +(lessMoney[1] ?? lessMoney[2]) : null;
  c("investment", lessN !== null && app.investment !== null && lessN < app.investment * 0.8, `Notes say only ₹${lessN}L is available, but Investment says ₹${app.investment}L`);
  c("space", (app.space === "Owned" || app.space === "Rented") && /\b(haven'?t|have not|not yet|yet to) (found|got|finali[sz]ed) (a |the |any )?(shop|space|place)|\bstill (searching|looking)\b/.test(notes), "Notes say they haven't found a shop yet, but Space says " + app.space);
  // The notes correct the form downwards: "Only 2 years experience, not 12 as written".
  const fixYears = notes.match(/\b(?:only|actually|just|really)\s+(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\b[^.;]{0,40}(?:experience|running|run|ran|managing|business|shop|retail)|\b(?:experience|running|ran|managed|business)\b[^.;]{0,20}\b(?:only|actually|just)\s+(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\b/);
  const said = fixYears ? +(fixYears[1] ?? fixYears[2]) : null;
  if (said !== null && app.experience !== null && said !== app.experience && !(textYears !== null && textYears - app.experience >= 3))
    c("experience", true, `${SOFT} Notes say ${said} years of experience, but Retail experience says ${app.experience}`);
  c("size", app.space === "Not yet identified" && (app.size ?? 0) > 0, "Space size is filled in although no space is identified");
  const wantLang = notes.match(/\b(kannada|hindi|english)\b.{0,15}\btraining|training\b.{0,15}\b(kannada|hindi|english)\b|not comfortable in (kannada|hindi|english)/);
  if (wantLang && app.language) {
    const named = (wantLang[1] ?? wantLang[2] ?? "").toLowerCase();
    const asked = wantLang[3] ? (["kannada", "hindi", "english"].find((l) => l !== wantLang[3] && notes.includes(l)) ?? "") : named;
    if (asked && asked !== app.language.toLowerCase()) c("language", true, `${SOFT} Notes ask for training in ${asked.charAt(0).toUpperCase() + asked.slice(1)}, but Preferred language says ${app.language}`);
  }
  const later = notes.match(/\bnext (year|january|february|march|april|may|june|july|august|september|october|november|december)\b|\bafter (my|the|our) [a-z' ]{0,25}(wedding|exams?|harvest|retire\w*)/)?.[0] ?? sig.laterStart;
  if (later && (app.launch ?? 6) <= 4) c("launch", true, `${SOFT} Notes point to a later start ("${later}") than the ${app.launch}-month target`);
  const cityNow = (app.city || "").toLowerCase();
  if (sig.wantedCity && !cityNow.startsWith(sig.wantedCity.toLowerCase().slice(0, 5)))
    c("city", true, `${SOFT} Notes say they want the store in ${sig.wantedCity}, but the application is for ${app.city || "another city"}`);
  c("floor", app.floor === "Mall unit" && has(notes, /standalone|street[- ]facing|road[- ]facing|main road/), `${SOFT} Notes describe a standalone street shop, but Floor says Mall unit`);
  if (/^same as (above|before|previous)\b/.test(biz.trim()) || /^same as (above|before|previous)\b/.test(notes.trim()))
    contradictions.push(`${SOFT} Answers say "same as above" — each application is read on its own, so ask for the actual details`);

  return { category, relevance, urgency, deadline, intent, redFlags, positives, locationCues: [...cues], contradictions, fills: ruleFills(app), competitors: ruleCompetitors(notes), source: "rules" };
}

/** What the applicant says about competing shops, if anything. */
export function ruleCompetitors(notes: string): TextTags["competitors"] {
  const t = notes.toLowerCase();
  const shop = "(?:shops?|stores?|outlets?|showrooms?|opticians?|optical|chemists?|pharmac(?:y|ies)|salons?|restaurants?|cafes?|competitors?)";
  const quote = (re: RegExp) => notes.slice(Math.max(0, t.search(re)), Math.max(0, t.search(re)) + 60).replace(/[.;,]\s.*$/, "").trim();
  const none = new RegExp(`\\b(no|zero|not a single|hardly any)\\s+(other\\s+)?(\\w+\\s+)?${shop}|no competition|only (one|shop|store) (of its kind|in the area)|first (\\w+ )?${shop} (in|on|around)`);
  const many = new RegExp(`\\b(many|lots of|plenty of|too many|crowded|saturated|\\d{2,}|[89])\\s+(\\w+\\s+)?${shop}|(heavy|stiff|lots of|a lot of|tough|too much) competition|crowded market`);
  const some = new RegExp(`\\b(several|[5-7]|five|six|seven)\\s+(other\\s+)?(\\w+\\s+)?${shop}|moderate competition`);
  const few = new RegExp(`\\b(one|two|three|a few|couple of|[1-4])\\s+(other\\s+)?(\\w+\\s+)?${shop}\\s+(nearby|near|around|on|in)|some competition|little competition`);
  if (none.test(t)) return { level: "none", phrase: quote(none) };
  if (many.test(t)) return { level: "many", phrase: quote(many) };
  if (some.test(t)) return { level: "some", phrase: quote(some) };
  if (few.test(t)) return { level: "few", phrase: quote(few) };
  return undefined;
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
    else if (affirmed(t.normalize("NFC"), UPPER_FLOOR)) f.floor = "Upper";
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

/** Marks a notes-vs-form conflict that becomes a "confirm" condition instead of a hold. */
const SOFT = "(confirm)";
export const isSoft = (c: string) => c.startsWith(SOFT);
export const stripSoft = (c: string) => c.replace(SOFT, "").trim();

/**
 * True when `re` matches somewhere that isn't negated earlier in the same clause:
 * "No loan needed", "Not on the first floor", "never had any legal dispute" don't count.
 */
export function affirmed(text: string, re: RegExp): boolean {
  return firstAffirmed(text, re) !== null;
}
function firstAffirmed(text: string, re: RegExp): RegExpMatchArray | null {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  for (const m of text.matchAll(g)) {
    const clause = text.slice(Math.max(0, m.index! - 60), m.index).split(/[.;!?,(]|\s[-–—]\s|\bbut\b/).pop() ?? "";
    if (!NEGATION.test(clause)) return m;
  }
  return null;
}
const NEGATION = /\b(no|not|never|without|nor|neither|don'?t|doesn'?t|didn'?t|isn'?t|aren'?t|wasn'?t|haven'?t|hasn'?t)\b|नहीं|ಇಲ್ಲ/;

// Upper floor in English shorthand, Kannada and Hindi. "ನೆಲ ಮಹಡಿ" / "भूतल" mean ground floor, so the
// Kannada and Hindi forms need an ordinal in front.
export const UPPER_FLOOR = /\b(first|1st|second|2nd|third|3rd|upper|top)[- ]?(floor|flr|fl)\b|\bbasement\b|\bmezzanine\b|(ಮೊದಲ|ಮೊದಲನೇ|ಎರಡನೇ|ಮೂರನೇ|ಮೇಲಿನ)\s*ಮಹಡಿ|(पहली|दूसरी|तीसरी|ऊपर की|ऊपरी)\s*मंज|फर्स्ट फ्लोर|सेकंड फ्लोर/;
const REL = "(?:wife|husband|son|daughter|brother|sister|father|mother|nephew|niece|son-in-law|daughter-in-law|brother-in-law|cousin)";
const CITY_WORDS: [string, RegExp][] = [
  ["Bengaluru", /\b(bengaluru|bangalore|blr)\b/], ["Mysuru", /\b(mysuru|mysore)\b/], ["Mangaluru", /\b(mangaluru|mangalore)\b/],
  ["Hubballi-Dharwad", /\b(hubballi|hubli|dharwad)\b/], ["Belagavi", /\b(belagavi|belgaum)\b/], ["Tumakuru", /\b(tumakuru|tumkur)\b/], ["Davanagere", /\b(davanagere|davangere)\b/],
];

const WITHDRAWN_RE = /^\s*withdrawn\b|\bwithdraw(n|ing)? (my |this |the )?(application|form|interest)\b|\b(do not|don'?t|dont|pls dont|please don'?t) (process|consider)\b|\bcancel (my|this|the) (application|form)\b|\bno longer (interested|want|wish)\b|\bnot interested any ?more\b|\bdrop (my|this) application\b|आवेदन वापस|ಅರ್ಜಿ ಹಿಂಪಡೆ/i;

/**
 * Signals the engine decides on, read by rules. When the AI has tagged the
 * text, its reading of the same signals takes precedence (see run.ts).
 */
export function ruleSignals(app: Application) {
  const notes = app.notes.toLowerCase().normalize("NFC");
  const all = `${app.name.toLowerCase()} ${app.business.toLowerCase()} ${notes}`;
  const loanSanctioned = /loan\b.{0,25}\b(sanction|approv)ed|sanction(ed)? (letter|loan)/.test(all);
  const loan = affirmed(all, /\bloan\b|borrow|need fund|financ(e|ing) needed|\bemi\b|mortgage/);
  // Own money stated next to a loan: "have 15 in hand", "own funds 15".
  const own = notes.match(/have\s*(?:₹|rs\.?)?\s*(\d+(?:\.\d+)?)\s*(?:lakhs?|l\b)?\s*(?:in hand|of my own)|(?:own (?:funds?|money)|savings?)\s*(?:of\s*)?(?:₹|rs\.?)?\s*(\d+(?:\.\d+)?)/);
  // Money from someone else: "16L from my brother-in-law".
  const co = all.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:l|lakhs?|lac)\\b[^.,;]{0,15}\\bfrom (?:my |our )?(${REL.slice(3, -1)}|uncle|aunt|friend|relative|partner|investor|in-laws?)`));
  // Distance to one of the brand's own stores, as the applicant describes it.
  const near = firstAffirmed(notes, /\b(opposite|next door to|next to|adjacent to|walking distance (?:from|of|to)|same (?:main )?road as|same street as|near|close to|(?:approx\.?|about|around|~)?\s*(\d+(?:\.\d+)?)\s*(km|kms|kilomet\w+|m|mtrs?|metres?|meters?)\s*(?:away )?from)\b[^.,;]{0,40}\byour\b[^.,;]{0,30}\b(store|shop|outlet|showroom|branch)/);
  let overlap: { level: "direct" | "near"; phrase: string; km?: number } | null = null;
  if (near) {
    const km = near[2] !== undefined ? +near[2] / (/^k/.test(near[3]) ? 1 : 1000) : undefined;
    const direct = /opposite|next door|next to|adjacent|walking distance/.test(near[1]) || (km !== undefined && km < 1);
    if (km === undefined || km < 3) overlap = { level: direct ? "direct" : "near", phrase: near[0].trim(), km };
  }
  // A different allowed city named as the one they want: "I want the store in Mysuru, not Mangaluru".
  const want = notes.match(/\b(want|prefer|would like|wish|looking)\w*\b[^.;]{0,40}/);
  const wantedCity = want
    ? (CITY_WORDS.map(([c, re]) => [c, want[0].search(re)] as const).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1])[0]?.[0] ?? null)
    : null;
  const later = firstAffirmed(notes, /\b(?:only )?(?:open|start)\w*\s+(?:only\s+)?after\s+(\d+|one|two|three)\s+years?\b|\bafter\s+(\d+|one|two|three)\s+years?\b/);
  return {
    withdrawn: WITHDRAWN_RE.test(notes),
    loan,
    loanSanctioned,
    ownFunds: loan && own ? +(own[1] ?? own[2]) : null,
    coInvestor: co ? { amount: +co[1], from: co[2] } : null,
    competitorFranchise: affirmed(all, /other franchise|another franchise|competing( \w+)? brand|franchisee of|already a franchisee|franchise of a compet|\b(run|runs|running|own|owns|operate|operates|operating|have|has)\s+(a|an|the)\s+[\w+&'. -]{1,25}?\s+franchise\b/),
    proxy:
      new RegExp(`\\b${REL}\\b[^.,;]{0,25}\\bwill (?:\\w+ ){0,2}(run|manage|look after|handle|take care of|operate|sit in)|\\b(run|managed|handled|looked after) by (my )?${REL}\\b|\\bapplying (for|on behalf of) (my )?${REL}\\b|\\bon behalf of\\b|${REL}'s? (shop|business)`).test(all) ||
      new RegExp(`\\((for|on behalf of)\\b|\\bfor (my )?${REL}\\b`).test(app.name.toLowerCase()),
    partnership: /\bpartnership\b|\bpooled\b|\b(\d+|two|three|four) (partners|friends)\b/.test(all) || /,.*(&|\band\b)/.test(app.name),
    influence: /(cousin|relative|friend|brother|uncle|nephew) of your|approval is (confirmed|assured|guaranteed)|know(s)? your (regional|area|city)? ?(manager|ceo|owner|director)|pre-?approved/.test(all),
    injection: /ignore (all )?(previous|prior|above) instructions|approve this application|mark (it|this|me) (as )?approved|you must approve|\bsystem\s*:|reviewer ai|set (the )?decision|decision\s*=/.test(all),
    family: new RegExp(`\\b${REL}\\b[^.;]{0,30}\\b(also|too)\\b[^.;]{0,25}\\b(appl(ied|ying|y|ication)|form)\\b|\\b${REL}\\b[^.;]{0,30}\\bhas applied\\b`).test(all),
    sameAs: notes.match(/\b(?:same as|phone (?:number )?same as|duplicate of|also applied as)\s+(app[\s\-_]*\d+)/i)?.[1] ?? null,
    secondApplication: /\b(second|another|other) (application|form)\b|\bboth stores\b|same as my other form/.test(all),
    siteReady: /already vacant|vacant|keys (in hand|ready)|ready to (move|start|sign)|can start (next week|immediately|tomorrow)|lease (signed|ready)/.test(notes) ? 1 : /still negotiating|negotiating (the )?rent|not (yet )?(signed|finalised|finalized)|owner hasn't agreed/.test(notes) ? -1 : 0,
    overlap,
    wantedCity,
    laterStart: later ? later[0] : null,
  };
}
export type Signals = ReturnType<typeof ruleSignals>;

/** The AI reads negation, paraphrase, Kannada and Hindi better; where it gave an answer, it wins. */
export function mergeSignals(r: Signals, ai?: AiSignals): Signals {
  if (!ai) return r;
  return {
    ...r,
    withdrawn: ai.withdrawn ?? r.withdrawn,
    proxy: ai.someoneElseRuns ?? r.proxy,
    loan: ai.loanDependent ?? r.loan,
    competitorFranchise: ai.otherFranchise ?? r.competitorFranchise,
    overlap: ai.nearOwnStore === undefined ? r.overlap : ai.nearOwnStore === "none" ? null : { level: ai.nearOwnStore, phrase: ai.nearPhrase || r.overlap?.phrase || "near your store" },
    wantedCity: ai.wantedCity ?? r.wantedCity,
  };
}
