import type {
  AltPin, Application, Condition, Decision, EngineInput, EngineOutput, Factor, Issue, Locality, PathToYes,
  Result, Store, Territory, TerritoryResult, TextTags, Tier,
} from "./types";
import { ARCHETYPE_LABEL, CITY_BY_NAME, GAZETTEER, ROAD_FACTOR, cityForPin, findCity, km, type CityInfo } from "./reference";
import { ruleTags, SEVERE_FLAG } from "./lexicon";
import { LOCATION_LABELS, PARTNER_LABELS } from "./rubric";
import { dimensions } from "./dimensions";

// The decision engine. Deterministic: the same inputs always give the same
// decisions. AI never runs in here — it only supplies text tags and locality
// guesses beforehand, and explanations afterwards.

const clamp = (n: number, lo = 0, hi = 10) => Math.max(lo, Math.min(hi, n));
const r1 = (n: number) => Math.round(n * 10) / 10;
const lakh = (n: number) => `₹${r1(n)}L`;
const PRI_RANK = { High: 3, Medium: 2, Low: 1 } as const;
export const DECISION_RANK: Record<Decision, number> = { Approve: 4, Conditional: 3, Hold: 2, Reject: 1 };

interface Dist { km: number; approx: boolean }

function makeGeo(localities: Record<string, Locality>) {
  const loc = (pin: string): Locality | null => localities[pin] ?? GAZETTEER[pin] ?? null;
  const dist = (a: string, b: string): Dist => {
    if (a === b) return { km: 0, approx: false };
    const la = loc(a);
    const lb = loc(b);
    const ca = cityForPin(a);
    const cb = cityForPin(b);
    if (la?.lat && lb?.lat && la.lng && lb.lng)
      return { km: r1(km({ lat: la.lat, lng: la.lng }, { lat: lb.lat, lng: lb.lng })), approx: la.confidence !== "mapped" || lb.confidence !== "mapped" };
    if (ca && cb && ca.name === cb.name) return { km: r1(1.5 + 0.35 * Math.min(40, Math.abs(+a - +b))), approx: true };
    if (ca && cb) return { km: Math.round(km(ca, cb) * ROAD_FACTOR), approx: true };
    return { km: 999, approx: true };
  };
  return { loc, dist };
}

interface Work {
  app: Application;
  city: CityInfo | null;
  ter: Territory | null;
  tier: Tier | null;
  tags: TextTags;
  locality: Locality | null;
  issues: Issue[];
  flags: string[];
  conditions: Condition[];
  majors: number;
  factors: Factor[];
  partnerScore: number;
  locationScore: number;
  score: number;
  hard: string | null;
  hold: string | null;
  nearestStore?: { id: string; km: number; approx: boolean };
  capex: number;
  relocatedFrom?: string;
}

export function runEngine(input: EngineInput, opts: { paths?: boolean } = {}): EngineOutput {
  const { brand, rubric, stores } = input;
  const geo = makeGeo(input.localities);
  const storeByPin = new Map<string, Store>(stores.map((s) => [s.pin, s]));
  const batchIssues: Issue[] = [];

  // ---------- Territories ----------
  const terIds = new Map<string, number>();
  const territories = input.territories.map((t) => {
    const n = (terIds.get(t.id) ?? 0) + 1;
    terIds.set(t.id, n);
    return n > 1 ? { ...t, id: `${t.id}#${n}` } : t;
  });
  for (const [id, n] of terIds) if (n > 1) batchIssues.push({ severity: "warn", code: "dup-territory", message: `Territory ID ${id} appears ${n} times; the copies are labelled ${id}#2… and treated as separate areas.` });

  const terIssues = new Map<string, Issue[]>(territories.map((t) => [t.id, [...t.parseIssues]]));
  const terTier = new Map<string, Tier | null>();
  const pinOwner = new Map<string, Territory>();
  const ordered = [...territories].sort((a, b) => PRI_RANK[b.priority ?? "Medium"] - PRI_RANK[a.priority ?? "Medium"] || (b.slots ?? 0) - (a.slots ?? 0));
  for (const t of ordered) {
    const iss = terIssues.get(t.id)!;
    const official = findCity(t.city) ?? (t.pins[0] ? cityForPin(t.pins[0]) : null);
    if (!official) iss.push({ severity: "warn", field: "city", code: "unknown-city", message: `City "${t.city}" is not one of the allowed cities.` });
    let tier = t.tier;
    if (official && t.tier && t.tier !== official.tier) {
      iss.push({ severity: "warn", field: "tier", code: "tier-mismatch", message: `Sheet says ${t.tier}, but ${official.name} is ${official.tier} in the allowed values — using ${official.tier}.` });
      tier = official.tier;
    }
    terTier.set(t.id, tier ?? official?.tier ?? null);
    for (const p of t.pins) {
      const pc = cityForPin(p);
      if (official && pc && pc.name !== official.name) iss.push({ severity: "warn", field: "pins", code: "pin-city", message: `Pin ${p} belongs to ${pc.name}, not ${official.name}.` });
      if (!pc) iss.push({ severity: "warn", field: "pins", code: "pin-outside", message: `Pin ${p} is outside the allowed cities.` });
      const prev = pinOwner.get(p);
      if (prev) {
        const msg = `Pin ${p} is listed in both ${prev.id} and ${t.id}; it counts for ${prev.id} (higher priority).`;
        iss.push({ severity: "warn", field: "pins", code: "pin-overlap", message: msg });
        terIssues.get(prev.id)!.push({ severity: "warn", field: "pins", code: "pin-overlap", message: msg });
      } else pinOwner.set(p, t);
    }
    if (t.slots === null) iss.push({ severity: "warn", field: "slots", code: "blank-slots", message: "Open slots is blank — treated as 0." });
  }
  const capacity = new Map<string, number>();
  const blocked = new Map<string, { pin: string; store: string }[]>();
  for (const t of territories) {
    const own = t.pins.filter((p) => pinOwner.get(p)?.id === t.id);
    const b = own.filter((p) => storeByPin.has(p)).map((p) => ({ pin: p, store: storeByPin.get(p)!.id }));
    blocked.set(t.id, b);
    const free = own.length - b.length;
    const slots = Math.max(0, t.slots ?? 0);
    capacity.set(t.id, Math.min(slots, free));
    if (slots > free) terIssues.get(t.id)!.push({ severity: "info", code: "slots-gt-pins", message: `${slots} open slots but only ${free} pin(s) without a store — one store per pin caps this territory at ${Math.min(slots, free)}.` });
    if (b.length) terIssues.get(t.id)!.push({ severity: "info", code: "store-pins", message: `Already served: ${b.map((x) => `${x.pin} (${x.store})`).join(", ")}.` });
  }

  // ---------- Applications: identity and data checks ----------
  const seen = new Map<string, number>();
  const apps = input.applications.map((a) => {
    const n = (seen.get(a.id) ?? 0) + 1;
    seen.set(a.id, n);
    return n > 1 ? { ...a, id: `${a.id}#${n}`, parseIssues: [...a.parseIssues, { severity: "warn" as const, code: "dup-id", message: `Application ID ${a.id} is used more than once — this row is labelled ${a.id}#${n}.` }] } : a;
  });
  const personKey = (a: Application) => `${a.name.toLowerCase().replace(/\s+/g, " ").trim()}|${a.pin}`;
  const firstByPerson = new Map<string, string>();

  const active = apps.filter((a) => !a.withdrawn);
  const matched = active.filter((a) => a.pin && pinOwner.has(a.pin) && !cityMismatch(a));
  const scenario: EngineOutput["summary"]["gateScenario"] = !active.length ? "none" : matched.length ? "A" : "B";
  if (scenario === "B") batchIssues.push({ severity: "warn", code: "fallback", message: "No application in this batch is in a preferred territory, so the Phase 1 hard reject is lifted and every application carries the flag 'Not a preferred location for company'." });

  const invs = apps.map((a) => a.investment).filter((x): x is number => typeof x === "number" && x > 0).sort((a, b) => a - b);
  const medianInv = invs.length ? (invs.length % 2 ? invs[(invs.length - 1) / 2] : (invs[invs.length / 2 - 1] + invs[invs.length / 2]) / 2) : 0;
  const dupOf = new Map<string, string>();
  for (const a of apps) {
    if (!a.name) continue;
    const pk = personKey(a);
    if (firstByPerson.has(pk)) dupOf.set(a.id, firstByPerson.get(pk)!);
    else firstByPerson.set(pk, a.id);
  }

  const assess = (raw: Application, relocatedFrom?: string): Work => {
    const rules = ruleTags(raw, brand, new Set(input.edited?.[raw.id] ?? []));
    const ai = input.tags[raw.id];
    // The AI reads nuance better; a keyword hit on the brand's own trade is a floor it can't go under.
    const REL = { direct: 3, adjacent: 2, unrelated: 1, none: 0 } as const;
    const tags = ai ? { ...ai, relevance: REL[rules.relevance] > REL[ai.relevance] ? rules.relevance : ai.relevance } : rules;
    const conditions: Condition[] = [];
    const { app, filled } = applyFills(raw, { ...rules.fills, ...ai?.fills });
    const issues: Issue[] = app.parseIssues.filter((i) => !(i.field && i.field in filled));
    for (const [k, v] of Object.entries(filled)) issues.push({ severity: "info", field: k, code: "from-notes", message: `${FIELD_LABEL[k]} was blank in the sheet — read "${v}" from the applicant's notes.` });
    if (Object.keys(filled).length) conditions.push({ code: "confirm-notes", text: `Confirm what the notes say: ${Object.entries(filled).map(([k, v]) => `${FIELD_LABEL[k].toLowerCase()} ${v}`).join(", ")}.` });
    const flags: string[] = [];
    let majors = 0;
    const cityByPin = app.pin ? cityForPin(app.pin) : null;
    const cityByName = findCity(app.city);
    if (app.pin && !cityByPin) issues.push({ severity: "warn", field: "pin", code: "pin-outside", message: `Pin ${app.pin}${app.city ? ` (${app.city})` : ""} is outside the seven cities in scope.` });
    if (cityByName && cityByPin && cityByName.name !== cityByPin.name)
      issues.push({ severity: "block", field: "city", code: "city-pin-mismatch", message: `City says ${cityByName.name}, but pin ${app.pin} is in ${cityByPin.name}. Which one is the store meant for?` });
    if (app.city && !cityByName) issues.push({ severity: "warn", field: "city", code: "unknown-city", message: `City "${app.city}" is not on the allowed list — using the pin code.` });
    if (app.state && !/karnataka|^ka$/i.test(app.state)) issues.push({ severity: "warn", field: "state", code: "state", message: `State says "${app.state}", but every allowed city is in Karnataka.` });
    if ((app.space === "Owned" || app.space === "Rented") && !app.size) issues.push({ severity: "warn", field: "size", code: "missing-size", message: `Space is ${app.space.toLowerCase()} but its size is blank.` });
    if ((app.space === "Owned" || app.space === "Rented") && app.floor === "Not known") issues.push({ severity: "warn", field: "floor", code: "floor-unknown", message: "A space is identified but its floor is not known." });
    if (app.space === "Not yet identified" && app.floor && app.floor !== "Not known") issues.push({ severity: "info", field: "floor", code: "floor-preference", message: `Floor "${app.floor}" given without a space — read as a preference only.` });
    if (app.experience === null) issues.push({ severity: "info", field: "experience", code: "assumed-exp", message: "Retail experience blank — assumed 0 years." });
    if (app.launch === null) issues.push({ severity: "info", field: "launch", code: "assumed-launch", message: "Target launch blank — assumed 6 months." });
    if (!app.name) issues.push({ severity: "warn", field: "name", code: "missing-name", message: "Applicant name is blank." });
    if (dupOf.has(app.id)) issues.push({ severity: "warn", code: "dup-person", message: `Same name and pin as ${dupOf.get(app.id)} — likely a duplicate submission.` });

    for (const c of tags.contradictions) issues.push({ severity: "warn", code: "contradiction", message: c });
    // Clear form-vs-notes conflicts found by the rules need one answer before deciding;
    // softer ones read by the AI become a "confirm" condition instead.
    const firmConflicts = rules.contradictions.filter((c) => !/size is filled in/i.test(c));

    const city = cityByPin ?? cityByName;
    const ter = app.pin && !cityMismatch(app) ? pinOwner.get(app.pin) ?? null : null;
    const tier = ter ? terTier.get(ter.id) ?? city?.tier ?? null : city?.tier ?? null;
    const locality = app.pin ? geo.loc(app.pin) ?? (city ? { pin: app.pin, name: app.pin === city.headPin ? `${city.name} centre` : `${city.name} · ${app.pin}`, archetype: app.pin === city.headPin ? "cbd" : "unknown", confidence: "estimated" } : null) : null;
    const capex = brand.capexLakh[tier ?? "Tier 2"];

    let nearestStore: Work["nearestStore"];
    if (app.pin) for (const s of stores) {
      const d = geo.dist(app.pin, s.pin);
      if (!nearestStore || d.km < nearestStore.km) nearestStore = { id: s.id, km: d.km, approx: d.approx };
    }

    // ---------- Factor scores ----------
    const factors: Factor[] = [];
    const pw = { ...rubric.partner };
    if (!brand.partnerOperates) {
      // Company-operated: the partner's own retail skill matters half as much.
      const moved = pw.operational / 2;
      pw.operational -= moved;
      pw.financial += moved;
    }
    const P = (k: keyof typeof pw, score: number, evidence: string, assumed?: boolean) =>
      factors.push({ key: k, label: PARTNER_LABELS[k], group: "partner", weight: pw[k], score: r1(clamp(score)), evidence, assumed });
    const L = (k: keyof typeof rubric.location, score: number, evidence: string, assumed?: boolean) =>
      factors.push({ key: k, label: LOCATION_LABELS[k], group: "location", weight: rubric.location[k], score: r1(clamp(score)), evidence, assumed });

    // Floor
    const nys = app.space === "Not yet identified" || app.space === null;
    {
      // With no space yet, a stated floor is only a preference.
      const f = nys ? "Not known" : app.floor ?? "Not known";
      if (f === "Ground") P("floor", 10, "Ground floor — easiest walk-in access.");
      else if (f === "Mall unit") P("floor", brand.mallFit === "good" ? 8 : brand.mallFit === "ok" ? 6.5 : 4, `Mall unit — ${brand.mallFit === "good" ? "strong footfall for this category" : brand.mallFit === "ok" ? "workable for this category" : "a poor fit for this category"}.`);
      else if (f === "Upper") {
        P("floor", brand.groundCritical ? (brand.footfall === "high" ? 2.5 : 3.5) : 6.5, brand.groundCritical ? "Upper floor — walk-ins drop sharply; this format needs street access." : "Upper floor — acceptable for this format.");
        if (brand.groundCritical) {
          conditions.push({ code: "relocate", text: "Move to a ground-floor or mall unit; upper floors don't work for this format.", lever: "ground floor" });
          majors++;
        }
      } else P("floor", nys ? 5 : 4, nys ? "No space yet — the brand will require a ground-floor site." : "Floor not stated for the identified space.", true);
    }
    // Size
    {
      const s = brand.sqft;
      if (nys) P("size", 5, `No space yet — to be sourced at the ${s.idealMin}–${s.idealMax} sq ft prototype.`, true);
      else if (!app.size) {
        P("size", 4, "Space size not given.", true);
        conditions.push({ code: "confirm-size", text: "Confirm the carpet area of the space.", lever: "size" });
      } else {
        const z = app.size;
        if (z >= s.idealMin && z <= s.idealMax) P("size", 10, `${z} sq ft sits inside the ${s.idealMin}–${s.idealMax} sq ft prototype.`);
        else if (z >= s.min && z <= s.max) P("size", 7.5, `${z} sq ft is workable (prototype ${s.idealMin}–${s.idealMax}).`);
        else if (z >= s.min * 0.8 && z <= s.max * 1.2) {
          P("size", 5, `${z} sq ft is ${z < s.min ? "slightly undersized" : "oversized"} — needs a format adjustment.`);
          conditions.push({ code: "format", text: `Get format sign-off for a ${z} sq ft store (prototype ${s.idealMin}–${s.idealMax}).`, lever: "size" });
        } else {
          P("size", 2, `${z} sq ft is ${z < s.min ? "far too small for the core range" : "far too big — wasted rent and utilities"} (prototype ${s.idealMin}–${s.idealMax}).`);
          conditions.push({ code: "resize", text: `Find a ${s.idealMin}–${s.idealMax} sq ft space; ${z} sq ft does not fit the format.`, lever: "size" });
          majors++;
        }
      }
    }
    // Ownership
    {
      const shortLease = tags.redFlags.some((f) => /short-term lease/i.test(f));
      if (app.space === "Owned") P("ownership", 10, "Owned — no rent and no landlord risk.");
      else if (app.space === "Rented") P("ownership", shortLease ? 4 : 7, shortLease ? "Rented on a short-term lease — renewal risk." : "Rented — standard, but adds fixed rent.");
      else P("ownership", 3, "No space secured yet.", app.space === null);
      if (nys && app.space !== null) {
        conditions.push({ code: "find-space", text: `Secure a ${brand.groundCritical ? "ground-floor " : ""}${brand.sqft.idealMin}–${brand.sqft.idealMax} sq ft space in pin ${app.pin || "?"} within 60 days (slot reserved meanwhile); the brand's site team audits it.`, lever: "space" });
        majors++;
      }
    }
    // Financial
    let hard: string | null = null;
    {
      const inv = app.investment;
      const loan = tags.redFlags.some((f) => /loan/i.test(f));
      if (inv === null) P("financial", 5, "Investment capacity not given.", true);
      else {
        const r = inv / capex;
        let sc = r >= 1.3 ? 10 : r >= 1 ? 7 + ((r - 1) / 0.3) * 2 : r >= 0.75 ? 4 + ((r - 0.75) / 0.25) * 2 : r >= rubric.capitalFloor ? 2 + ((r - rubric.capitalFloor) / (0.75 - rubric.capitalFloor)) * 2 : 0;
        if (loan && sc > 0) sc -= 1;
        const pct = Math.round(r * 100);
        P("financial", sc, `${lakh(inv)} vs ${tier ?? "Tier 2"} minimum ${lakh(capex)} (${(r).toFixed(2)}×) · batch median ${lakh(medianInv)}${r >= 1.3 ? " — includes a working-capital buffer" : r >= 1 ? " — covers setup, thin buffer" : ""}${loan ? "; relies on a loan" : ""}.`);
        if (r < rubric.capitalFloor) hard = `Severely undercapitalised: ${lakh(inv)} is ${pct}% of the ${lakh(capex)} needed (below ${Math.round(rubric.capitalFloor * 100)}%).`;
        else if (r < 1) {
          conditions.push({ code: "funding-gap", text: `Close a funding gap of ${lakh(capex - inv)} (sanction letter or co-investor) before signing.`, lever: "capital" });
          majors++;
        }
      }
    }
    // Operational
    {
      const y = app.experience ?? 0;
      let sc = y === 0 ? 2 : y < 2 ? 5 : y < 3 ? 6 : y < 4 ? 6.5 : y < 5 ? 7 : y < 10 ? 8 : 8.5;
      const bonus = { direct: 1.5, adjacent: 1, unrelated: 0, none: y > 0 ? -0.5 : 0 }[tags.relevance];
      sc += bonus;
      if (tags.positives.some((p) => /more than one outlet|management/i.test(p))) sc += 0.5;
      const absent = tags.redFlags.some((f) => /hands-on/i.test(f));
      if (absent && brand.partnerOperates) {
        sc -= 2;
        conditions.push({ code: "manager", text: "Name a full-time store manager who completes the brand training.", lever: "manager" });
      }
      if (brand.needsExistingBusiness && (tags.relevance === "none" || !app.business)) {
        sc -= 2;
        conditions.push({ code: "existing-shop", text: "This model needs a running shop to host the brand corner.", lever: "shop" });
        majors++;
      }
      const relText = { direct: `directly relevant (${tags.category})`, adjacent: `adjacent retail (${tags.category})`, unrelated: `unrelated field (${tags.category})`, none: "no business described" }[tags.relevance];
      P("operational", sc, `${y} year${y === 1 ? "" : "s"} running a shop; ${relText}${absent ? "; owner may not be hands-on" : ""}.`, app.experience === null);
    }
    // Speed to market
    {
      const L0 = app.launch ?? 6;
      let sc = L0 <= 3 ? 10 : L0 <= 6 ? 7 : L0 <= 9 ? 4 : 3;
      const lead = nys ? brand.leadMonths.withoutSpace : brand.leadMonths.withSpace;
      let ev = `Wants to open in ${L0} month${L0 === 1 ? "" : "s"}`;
      if (L0 < lead) {
        sc = Math.min(sc, 6);
        ev += ` — faster than the ~${lead} months needed${nys ? " without a space" : ""}`;
        conditions.push({ code: "timeline", text: `Reset the launch to month ${Math.ceil(lead)}; ${L0} month${L0 === 1 ? " is" : "s are"} too fast${nys ? " without a space in hand" : " for fit-out and training"}.`, lever: "timeline" });
      }
      if (tags.urgency === "high") {
        sc += 0.5;
        if (tags.deadline) ev += `; deadline: ${tags.deadline}`;
      }
      P("speed", sc, ev + ".", app.launch === null);
    }
    // Local nuance
    {
      const lang = app.language;
      const t1 = tier === "Tier 1";
      const ls = lang === "Kannada" ? 10 : lang === "English" ? (t1 ? 7.5 : 6) : lang === "Hindi" ? (t1 ? 6 : 4) : 5;
      let is = tags.intent === "strong" ? 10 : tags.intent === "generic" ? 6.5 : 3;
      if (tags.positives.some((p) => /local roots/i.test(p))) is += 1;
      P("local", (ls + clamp(is)) / 2, `${lang ?? "No language"} ${lang === "Kannada" ? "matches local customers and staff" : t1 ? "works in cosmopolitan Bengaluru" : "may limit local hiring"}; notes show ${tags.intent} intent.`, !lang);
    }

    // Location
    const cap = ter ? capacity.get(ter.id) ?? 0 : 0;
    if (!ter) {
      L("strategic", scenario === "B" ? 2 : 0, scenario === "B" ? "Not a preferred location for company (fallback batch)." : `Pin ${app.pin || "?"} is in no territory on the expansion plan.`);
      if (scenario === "B") flags.push("FLAG: Not a preferred location for company");
    } else {
      const p = ter.priority ?? "Medium";
      const sc = cap === 0 ? 0 : p === "High" ? (cap >= 2 ? 10 : 8.5) : p === "Medium" ? (cap >= 2 ? 7.5 : 6) : cap >= 2 ? 4 : 3;
      L("strategic", sc, `${ter.id} (${ter.city || city?.name}) is ${p} priority with ${cap} open slot${cap === 1 ? "" : "s"}.`);
    }
    {
      const arch = locality?.archetype ?? "unknown";
      const base = tier === "Tier 1" ? 8 : tier === "Tier 2" ? 6.5 : 5;
      const adj = { cbd: 1.5, "high-street": 1.5, transit: 1, "it-corridor": 1, "premium-residential": 1, residential: 0, "peri-urban": -1.5, industrial: -2, unknown: 0 }[arch];
      L("demographic", base + adj, `${tier ?? "Unknown tier"} city; ${locality ? `${locality.name} — ${ARCHETYPE_LABEL[arch].toLowerCase()}` : "locality unknown"}${locality?.confidence === "ai" ? " (AI estimate)" : ""}.`, arch === "unknown");
      const hi: Record<string, number> = { transit: 9, cbd: 9, "high-street": 9, "it-corridor": 7.5, "premium-residential": 7, residential: 6, "peri-urban": 4, industrial: 3.5, unknown: 6 };
      const low: Record<string, number> = { transit: 6.5, cbd: 6, "high-street": 6.5, "it-corridor": 8, "premium-residential": 8, residential: 8.5, "peri-urban": 6, industrial: 6.5, unknown: 6 };
      let j = brand.footfall === "low" ? low[arch] : hi[arch];
      if (brand.footfall === "medium" && /residential/.test(arch)) j = 7.5;
      if (app.floor === "Mall unit" && brand.footfall !== "low") j = Math.max(j, 8.5);
      const cues = tags.locationCues.filter((c) => brand.triggers.some((t) => c.includes(t) || t.includes(c)));
      j += Math.min(1.5, cues.length * 0.75);
      L("jtbd", j, `${brand.footfall === "low" ? "Order density" : "Purchase-trigger strength"}: ${ARCHETYPE_LABEL[arch].toLowerCase()}${app.floor === "Mall unit" ? ", inside a mall" : ""}${cues.length ? `; near ${cues.join(", ")}` : ""}.`, arch === "unknown" && !cues.length);
    }
    {
      const cityStores = city ? stores.filter((s) => findCity(s.city)?.name === city.name || cityForPin(s.pin)?.name === city.name) : [];
      if (!city) L("supply", 5, "City unknown.", true);
      else if (cityStores.length) L("supply", city.name === "Bengaluru" ? 10 : 9, `${city.name} already has ${cityStores.length} store${cityStores.length > 1 ? "s" : ""} — existing replenishment route.`);
      else {
        let best: { c: CityInfo; d: number; id: string } | null = null;
        for (const s of stores) {
          const c = cityForPin(s.pin) ?? findCity(s.city);
          if (!c) continue;
          const d = Math.round(km(city, c) * ROAD_FACTOR);
          if (!best || d < best.d) best = { c, d, id: s.id };
        }
        const d = best?.d ?? 400;
        L("supply", d <= 120 ? 8 : d <= 250 ? 6.5 : 4.5, `No store in ${city.name} yet; nearest is ${best?.c.name ?? "—"} (${best?.id}) ~${d} km by road${d > 120 ? " — needs a modified delivery schedule" : ""}.`);
      }
    }
    {
      const inv = app.investment;
      let e = 5;
      let ev = "Investment not known.";
      if (inv !== null) {
        const r = inv / capex;
        e = r >= 1.3 ? 9 : r >= 1 ? 7 : r >= 0.75 ? 5 : 3;
        ev = `Capital covers ${Math.round(r * 100)}% of setup`;
        if (app.space === "Owned") (e += 1), (ev += "; owned space removes rent");
        else if (app.space === "Rented" && tier === "Tier 1") (e -= 0.5), (ev += "; Tier 1 rents are high");
        else if (nys) (e = Math.min(e, 6)), (ev += "; rent not yet known");
        ev += ".";
      }
      L("economics", e, ev, inv === null);
    }
    {
      const ns = nearestStore;
      const cityHasStore = city && stores.some((s) => cityForPin(s.pin)?.name === city.name);
      if (ns && cityHasStore) {
        const d = ns.km;
        const sc = d < rubric.saturationKm ? 2 : d < 4 ? 5 : d < 7 ? 8 : 9;
        L("competition", sc, `Nearest own store ${ns.id} is ${ns.approx ? "~" : ""}${d} km away${d < rubric.saturationKm ? " — catchments overlap (cannibalisation)" : d < 4 ? " — partial catchment overlap" : " — proven city, separate catchment"}.`);
      } else L("competition", ter?.priority === "High" ? 9.5 : 7.5, `White space — no own store in ${city?.name ?? "this city"} yet${ter?.priority === "High" ? ", and it is a High-priority territory" : ""}.`);
    }

    const sum = (g: "partner" | "location") => factors.filter((f) => f.group === g).reduce((a, f) => a + (f.score / 10) * f.weight, 0);
    const partnerScore = r1(sum("partner"));
    const locationScore = r1(sum("location"));
    const score = r1((partnerScore * rubric.blend.partner + locationScore * rubric.blend.location) / 100);

    // ---------- Hard checks (order = most fundamental first) ----------
    const st = app.pin ? storeByPin.get(app.pin) : undefined;
    const capitalFail = hard;
    hard = null;
    let outside = false;
    if (app.withdrawn) hard = "Withdrawn by the applicant.";
    else if (cityMismatch(app)) hard = null; // don't reject on a location the applicant may not mean
    else if (st) hard = `Pin ${app.pin} already has store ${st.id} (opened ${st.opened ?? "earlier"}). The brand never opens two stores in one pin code.`;
    else if (app.pin && !cityForPin(app.pin) && !issues.some((i) => i.severity === "block")) outside = true;
    else if (scenario === "A" && !ter && app.pin && !issues.some((i) => i.severity === "block")) outside = true;
    else if (ter && cap === 0) hard = `${ter.id} has no open slot${(ter.slots ?? 0) > 0 ? " left once existing stores are counted" : " (0 open slots)"}.`;
    else hard = capitalFail;

    let hold: string | null = outside && !cityForPin(app.pin) ? `Outside the expansion area: ${app.city || "this location"} (pin ${app.pin}) is not one of the seven cities the brand is expanding in. Kept on the waitlist.` : outside ? `Outside the expansion area: pin ${app.pin} is in no territory, while ${matched.length} other application${matched.length === 1 ? " is" : "s are"} (Phase 1 check). Kept on the waitlist — it goes forward if the team adds this pin.` : null;
    const blocks = issues.filter((i) => i.severity === "block");
    if (!hard && !hold && blocks.length) {
      hold = `Needs information: ${blocks.map((b) => b.message).join(" ")}`;
      const sp = app.pin ? storeByPin.get(app.pin) : undefined;
      if (cityMismatch(app) && sp) hold += ` If the pin is right, it is already served by ${sp.id}.`;
    }
    if (!hard && !hold && dupOf.has(app.id)) hold = `Duplicate of ${dupOf.get(app.id)} (same applicant and pin) — merge the two before deciding.`;
    const severe = tags.redFlags.filter((f) => SEVERE_FLAG.test(f));
    if (!hard && !hold && severe.length) hold = `Verify before deciding: ${severe.join("; ").toLowerCase()}.`;
    if (!hard && !hold && firmConflicts.length) hold = `Needs clarification: ${firmConflicts.join("; ")}${app.notes ? ` (notes: "${app.notes.slice(0, 90)}${app.notes.length > 90 ? "…" : ""}")` : ""}.`;
    for (const f of tags.redFlags) if (!SEVERE_FLAG.test(f)) flags.push(f);
    if (!ter && scenario === "B") conditions.push({ code: "territory", text: "Outside the current expansion plan — the team must open a territory for this pin.", lever: "territory" });
    for (const c of tags.contradictions) if (!firmConflicts.includes(c)) conditions.push({ code: "confirm", text: `Confirm: ${c.charAt(0).toLowerCase()}${c.slice(1)}.` });

    if (relocatedFrom) conditions.unshift({ code: "relocate-pin", text: `Relocate from pin ${relocatedFrom} (taken by a higher score) to free pin ${app.pin}${locality ? ` — ${locality.name}` : ""}; site team to confirm a space there.`, lever: "pin" });
    return { app, city, ter, tier, tags, locality, issues, flags, conditions, majors, factors, partnerScore, locationScore, score, hard, hold, nearestStore, capex, relocatedFrom };
  };
  const work: Work[] = apps.map((a) => assess(a));

  // ---------- Allocation: one store per pin, best score wins each slot ----------
  const fscore = (w: Work, keys: string[]) => w.factors.filter((f) => keys.includes(f.key)).reduce((x, f) => x + f.score * f.weight, 0);
  // Tie-break: score, then capital, then site readiness, then the sooner launch, then the lower ID.
  const rankCmp = (a: Work, b: Work) =>
    b.score - a.score || fscore(b, ["financial"]) - fscore(a, ["financial"]) || fscore(b, ["floor", "size", "ownership"]) - fscore(a, ["floor", "size", "ownership"]) || (a.app.launch ?? 6) - (b.app.launch ?? 6) || a.app.id.localeCompare(b.app.id, undefined, { numeric: true });

  type Status = { slot: Result["slot"]; decision: Decision; headline: string; pinRival?: string; rank?: Result["rank"] };
  const status = new Map<string, Status>();
  const eligible: Work[] = [];
  for (const w of work) {
    const thr = rubric.approveMin[w.tier ?? "Tier 2"];
    if (w.hard) status.set(w.app.id, { slot: "none", decision: "Reject", headline: w.hard });
    else if (w.hold) status.set(w.app.id, { slot: "none", decision: "Hold", headline: w.hold });
    else if (w.score < rubric.rejectBelow) status.set(w.app.id, { slot: "none", decision: "Reject", headline: `Score ${w.score} is below the reject line of ${rubric.rejectBelow}.` });
    else if (w.score < rubric.conditionalMin) status.set(w.app.id, { slot: "none", decision: "Hold", headline: `Borderline: score ${w.score} is in the review band (${rubric.rejectBelow}–${rubric.conditionalMin}); the Tier bar is ${thr}.` });
    else if (w.majors >= 3) status.set(w.app.id, { slot: "none", decision: "Hold", headline: `Not launch-ready: ${w.majors} major gaps (${w.conditions.filter((c) => ["find-space", "funding-gap", "relocate", "resize", "existing-shop"].includes(c.code)).map((c) => c.lever).join(", ")}).` });
    else eligible.push(w);
  }

  const byPin = new Map<string, Work[]>();
  for (const w of eligible) byPin.set(w.app.pin, [...(byPin.get(w.app.pin) ?? []), w]);
  const pinWinners: Work[] = [];
  const pinLosers: Work[] = [];
  let contestedPins = 0;
  for (const [p, list] of byPin) {
    list.sort(rankCmp);
    pinWinners.push(list[0]);
    if (list.length > 1) contestedPins++;
    for (const loser of list.slice(1)) {
      pinLosers.push(loser);
      status.set(loser.app.id, { slot: "lost-pin", decision: "Hold", pinRival: list[0].app.id, headline: `${list[0].app.id} scored higher for the same pin ${p} (${list[0].score} vs ${loser.score}), and no free pin in ${loser.ter?.id ?? "the area"} is left for a move. Only one store per pin.` });
    }
  }
  const terPool = new Map<string, Work[]>();
  for (const w of pinWinners) {
    if (!w.ter) {
      status.set(w.app.id, { slot: "outside", decision: "Conditional", headline: `Qualifies (score ${w.score}) but sits outside the expansion plan — needs the team to open a territory.` });
      continue;
    }
    terPool.set(w.ter.id, [...(terPool.get(w.ter.id) ?? []), w]);
  }
  // A strong partner who lost their pin can still take a slot on a free pin in
  // the same territory — re-scored at that pin, with a relocation condition.
  const usedPins = new Set([...pinWinners.map((w) => w.app.pin), ...stores.map((s) => s.pin)]);
  const finalWork = new Map<string, Work>(work.map((w) => [w.app.id, w]));
  for (const loser of pinLosers.sort(rankCmp)) {
    if (!loser.ter) continue;
    const tid = loser.ter.id;
    // Prefer pins no other live applicant has asked for; say so when that's impossible.
    const claimedBy = (p: string) => work.filter((w) => w.app.pin === p && w.app.id !== loser.app.id && !w.hard).map((w) => w.app.id);
    const options = loser.ter.pins
      .filter((p) => pinOwner.get(p)?.id === tid && !usedPins.has(p))
      .map((p) => assess({ ...loser.app, pin: p }, loser.app.pin))
      .filter((v) => !v.hard && !v.hold && v.score >= rubric.conditionalMin)
      .sort((a, b) => claimedBy(a.app.pin).length - claimedBy(b.app.pin).length || rankCmp(a, b));
    if (!options.length) continue;
    const others = claimedBy(options[0].app.pin);
    if (others.length) options[0].conditions[0].text += ` Note: ${others.join(", ")} also asked for ${options[0].app.pin} but ${others.length === 1 ? "does" : "do"} not qualify yet — if that changes, the decision re-runs.`;
    usedPins.add(options[0].app.pin);
    terPool.set(tid, [...(terPool.get(tid) ?? []), options[0]]);
  }
  const allocated = new Map<string, string[]>();
  const waitlist = new Map<string, string[]>();
  for (const [tid, list] of terPool) {
    list.sort(rankCmp);
    const cap = capacity.get(tid) ?? 0;
    const seated = list.slice(0, cap);
    list.forEach((w, i) => {
      const thr = rubric.approveMin[w.tier ?? "Tier 2"];
      if (i < cap) {
        const rank = { territory: i + 1, of: list.length };
        allocated.set(tid, [...(allocated.get(tid) ?? []), w.app.id]);
        finalWork.set(w.app.id, w);
        const clean = w.score >= thr && w.conditions.length === 0;
        if (w.score < thr) w.conditions.unshift({ code: "below-bar", text: `Score ${w.score} is under the ${w.tier} bar of ${thr}: approve with a 90-day performance review and extra mentoring.` });
        const rival = status.get(w.app.id)?.pinRival;
        const capNote = w.score >= thr && w.conditions.some((c) => c.code === "find-space") ? ` Score ${w.score} would be Approve, but no space is identified yet, so Conditional — slot reserved for 60 days.` : "";
        const moved = w.relocatedFrom ? ` It lost pin ${w.relocatedFrom} to ${rival}, but still outranks the rest of ${tid}, so it is offered free pin ${w.app.pin} instead.` : "";
        status.set(w.app.id, {
          slot: "won", rank, decision: clean ? "Approve" : "Conditional", pinRival: rival,
          headline: clean
            ? `Wins slot ${i + 1} of ${cap} in ${tid}; score ${w.score} clears the ${w.tier} bar of ${thr}.`
            : `Holds slot ${i + 1} of ${cap} in ${tid} (score ${w.score}) if ${w.conditions.length} condition${w.conditions.length > 1 ? "s are" : " is"} met.${capNote}${moved}`,
        });
      } else if (w.relocatedFrom) {
        // Not seated even after a move: stays on hold for its original pin.
        const st = status.get(w.app.id)!;
        status.set(w.app.id, { ...st, headline: `${st.pinRival} scored higher for the same pin ${w.relocatedFrom}; a move to free pin ${w.app.pin} (score ${w.score}) still ranks below the ${cap} slot holder${cap === 1 ? "" : "s"} in ${tid}.` });
      } else {
        waitlist.set(tid, [...(waitlist.get(tid) ?? []), w.app.id]);
        const took = seated.map((x) => `${x.app.id} ${x.score}`).join(", ");
        status.set(w.app.id, { slot: "waitlist", rank: { territory: i + 1, of: list.length }, decision: "Hold", headline: `Waitlisted #${waitlist.get(tid)!.length} for ${tid}: its ${cap} slot${cap === 1 ? "" : "s"} went to higher scores (${took}); this application scored ${w.score}.` });
      }
    });
  }
  const pinWinnersFinal = [...finalWork.values()].filter((w) => status.get(w.app.id)?.slot === "won");

  // Free pins left after allocation, for "try this pin instead" suggestions.
  const takenPins = new Set([...pinWinnersFinal.map((w) => w.app.pin), ...stores.map((s) => s.pin)]);
  const leftover = territories
    .filter((t) => (capacity.get(t.id) ?? 0) > (allocated.get(t.id)?.length ?? 0))
    .flatMap((t) => t.pins.filter((p) => pinOwner.get(p)?.id === t.id && !takenPins.has(p)).map((p) => ({ p, t })));
  const alternatives = (w: Work): AltPin[] => {
    if (!w.city || !w.app.pin) return [];
    return leftover
      .filter(({ p, t }) => cityForPin(p)?.name === w.city!.name && p !== w.app.pin && t.id !== (status.get(w.app.id)?.slot === "waitlist" ? w.ter?.id : ""))
      .map(({ p, t }) => ({ pin: p, territory: t.id, locality: geo.loc(p)?.name ?? `${w.city!.name} · ${p}`, km: geo.dist(w.app.pin, p).km }))
      .sort((a, b) => (a.km ?? 0) - (b.km ?? 0))
      .slice(0, 3);
  };

  // Two new stores too close together is a cannibalisation risk.
  const winners = pinWinnersFinal;
  for (const a of winners)
    for (const b of winners) {
      if (a.app.id >= b.app.id || a.city?.name !== b.city?.name) continue;
      const d = geo.dist(a.app.pin, b.app.pin);
      if (!d.approx && d.km < rubric.saturationKm) {
        const lower = a.score < b.score ? a : b;
        lower.flags.push(`Only ${d.km} km from ${lower === a ? b.app.id : a.app.id}, also approved in this batch — check catchment overlap.`);
      }
    }

  // ---------- Assemble ----------
  const results: Result[] = work.map((w0) => {
    const w = finalWork.get(w0.app.id) ?? w0;
    const s = status.get(w.app.id)!;
    const tid = w.ter?.id ?? null;
    const thr = rubric.approveMin[w.tier ?? "Tier 2"];
    const ranked = [...w.factors].sort((a, b) => (b.score - 6) * b.weight - (a.score - 6) * a.weight);
    const strengths = ranked.filter((f) => f.score >= 7.5).slice(0, 2).map((f) => `Strength — ${f.label}: ${f.evidence}`);
    const gaps = ranked.reverse().filter((f) => f.score < 5).slice(0, 2).map((f) => `Gap — ${f.label}: ${f.evidence}`);
    const nextInLine = tid && s.slot === "won" ? waitlist.get(tid)?.[0] : undefined;
    const buddy = w.app.pin ? nearestStoreTo(w.app.pin, stores, geo.dist) : undefined;
    const ownBonus = w.app.space === "Owned" ? { "Tier 1": 0.08, "Tier 2": 0.06, "Tier 3": 0.05 }[w.tier ?? "Tier 2"] : 0;
    const monthlyProfit = r1(brand.revenueLakhPerMonth[w.tier ?? "Tier 2"] * (brand.marginPct / 100 + ownBonus));
    const override = input.overrides[w.app.id];
    const res: Result = {
      id: w.app.id,
      app: w.app,
      territoryId: tid,
      tier: w.tier,
      locality: w.locality,
      decision: override?.decision ?? s.decision,
      engineDecision: s.decision,
      override,
      headline: s.headline,
      reasons: [...strengths, ...gaps],
      conditions: s.decision === "Approve" || s.decision === "Conditional" ? w.conditions : w.conditions.filter((c) => c.code !== "below-bar"),
      issues: w.issues,
      flags: w.flags,
      factors: w.factors,
      dimensions: dimensions(w.factors, rubric),
      partnerScore: w.partnerScore,
      locationScore: w.locationScore,
      score: w.score,
      threshold: thr,
      rank: s.rank,
      slot: s.slot,
      pinRival: s.pinRival,
      nextInLine,
      alternatives: s.decision === "Approve" ? [] : alternatives(w),
      nearestStore: w.nearestStore,
      buddyStore: buddy,
      payback: { capex: w.capex, monthlyProfit, months: monthlyProfit > 0 ? Math.round(w.capex / monthlyProfit) : 0 },
      paths: [],
      gate: !w.app.pin ? "n/a" : w.ter ? "pass" : scenario === "B" ? "fallback" : "fail",
    };
    return res;
  });

  if (opts.paths !== false) {
    for (const r of results) if (r.engineDecision !== "Approve" && !r.app.withdrawn) r.paths = pathsToYes(input, r, results);
  }

  const terResults: TerritoryResult[] = territories.map((t) => {
    const applicants = results.filter((r) => r.territoryId === t.id).map((r) => r.id);
    const cap = capacity.get(t.id) ?? 0;
    const al = allocated.get(t.id) ?? [];
    const wl = waitlist.get(t.id) ?? [];
    const demandRatio = cap ? r1(applicants.length / cap) : applicants.length ? 99 : 0;
    const outside = results.filter((r) => r.gate === "fail" && !storeByPin.has(r.app.pin) && cityForPin(r.app.pin)?.name === (findCity(t.city) ?? cityForPin(t.pins[0] ?? ""))?.name);
    const note = cap === 0
      ? `No capacity: ${(t.slots ?? 0) === 0 ? "0 open slots" : "every listed pin already has a store"}.${outside.length ? ` ${outside.length} applicant${outside.length > 1 ? "s" : ""} asked for nearby pins ${[...new Set(outside.map((r) => r.app.pin))].join(", ")} — consider adding them.` : ""}`
      : !applicants.length
      ? `No applicants — ${cap} slot${cap === 1 ? "" : "s"} unfilled. Run targeted outreach in ${t.pins.filter((p) => !storeByPin.has(p)).slice(0, 3).join(", ")}.`
      : al.length < cap
        ? `${cap - al.length} slot${cap - al.length === 1 ? "" : "s"} still open: ${applicants.length} applied but not all qualified.`
        : wl.length
          ? `Over-subscribed ${demandRatio}× — ${wl.length} qualified partner${wl.length === 1 ? "" : "s"} waitlisted. Consider adding slots.`
          : "Filled.";
    return { id: t.id, territory: t, tier: terTier.get(t.id) ?? null, capacity: cap, blockedPins: blocked.get(t.id) ?? [], applicants, allocated: al, waitlist: wl, demandRatio, issues: terIssues.get(t.id) ?? [], note };
  });

  const counts: Record<Decision, number> = { Approve: 0, Conditional: 0, Hold: 0, Reject: 0 };
  for (const r of results) counts[r.decision]++;
  const latent = new Map<string, { count: number; total: number }>();
  for (const r of results)
    if (r.gate === "fail" && !r.app.withdrawn && !storeByPin.has(r.app.pin)) {
      const c = cityForPin(r.app.pin)?.name ?? (r.app.city || "Unknown");
      const v = latent.get(c) ?? { count: 0, total: 0 };
      latent.set(c, { count: v.count + 1, total: v.total + r.score });
    }

  return {
    results,
    territories: terResults,
    summary: {
      total: results.length,
      counts,
      slotsOpen: terResults.reduce((a, t) => a + t.capacity, 0),
      slotsFilled: terResults.reduce((a, t) => a + t.allocated.length, 0),
      gateScenario: scenario,
      dataIssues: results.reduce((a, r) => a + r.issues.filter((i) => i.severity !== "info").length, 0) + terResults.reduce((a, t) => a + t.issues.filter((i) => i.severity !== "info").length, 0),
      contestedPins,
    },
    batchIssues,
    latentDemand: [...latent].map(([city, v]) => ({ city, count: v.count, avgScore: r1(v.total / v.count) })).sort((a, b) => b.count - a.count),
    ranAt: new Date().toISOString(),
  };
}

function cityMismatch(a: Application): boolean {
  const bp = a.pin ? cityForPin(a.pin) : null;
  const bn = findCity(a.city);
  return !!(bp && bn && bp.name !== bn.name);
}

function nearestStoreTo(pin: string, stores: Store[], dist: (a: string, b: string) => Dist) {
  let best: { id: string; city: string; km: number } | undefined;
  for (const s of stores) {
    const d = dist(pin, s.pin).km;
    if (!best || d < best.km) best = { id: s.id, city: s.city || cityForPin(s.pin)?.name || "", km: d > 10 ? Math.round(d) : d };
  }
  return best;
}

// ---------- Path to yes: what single change would move this partner up? ----------
function pathsToYes(input: EngineInput, r: Result, all: Result[]): PathToYes[] {
  const a = r.app;
  const brand = input.brand;
  const capex = brand.capexLakh[r.tier ?? "Tier 2"];
  const levers: { label: string; patch: Partial<Application> }[] = [];
  const ideal = Math.round((brand.sqft.idealMin + brand.sqft.idealMax) / 2);
  const nys = a.space === "Not yet identified" || a.space === null;
  if (nys || a.floor !== "Ground" || !a.size || a.size < brand.sqft.min || a.size > brand.sqft.max)
    levers.push({ label: `Secures a ground-floor ${ideal} sq ft space${nys ? " (rented)" : ""}`, patch: { space: nys ? "Rented" : a.space, floor: "Ground", size: ideal } });
  if (a.investment === null || a.investment < capex * 1.3)
    levers.push({ label: `${a.investment === null ? "Confirms" : "Raises"} capital to ${lakh(Math.ceil(capex * 1.3))}`, patch: { investment: Math.ceil(capex * 1.3) } });
  if ((a.launch ?? 6) > 3 && !nys) levers.push({ label: "Commits to opening within 3 months", patch: { launch: 3 } });
  if (a.experience === null) levers.push({ label: "Confirms retail experience (3 yrs)", patch: { experience: 3 } });
  if (a.language === null) levers.push({ label: "Confirms Kannada for training", patch: { language: "Kannada" } });
  for (const alt of r.alternatives.slice(0, 2)) levers.push({ label: `Moves to pin ${alt.pin} (${alt.territory}, ${alt.locality})`, patch: { pin: alt.pin, city: cityForPin(alt.pin)?.name ?? a.city } });
  const combo = levers.filter((l) => !l.patch.pin);
  if (combo.length > 1) levers.push({ label: `All of: ${combo.map((l) => l.label.charAt(0).toLowerCase() + l.label.slice(1)).join("; ")}`, patch: Object.assign({}, ...combo.map((l) => l.patch)) });

  const out: PathToYes[] = [];
  for (const lv of levers) {
    const apps = input.applications.map((x) => (x.id === a.id ? { ...x, ...lv.patch, parseIssues: x.parseIssues.filter((i) => !(i.field && i.field in lv.patch)) } : x));
    const tags = { ...input.tags };
    if (tags[a.id]) tags[a.id] = { ...tags[a.id], contradictions: [] };
    // The simulated facts are newer than the notes, so the notes can't contradict them.
    const edited = { ...(input.edited ?? {}), [a.id]: [...(input.edited?.[a.id] ?? []), ...Object.keys(lv.patch)] };
    const res = runEngine({ ...input, applications: apps, tags, overrides: {}, edited }, { paths: false }).results.find((x) => x.id === a.id);
    if (res && DECISION_RANK[res.engineDecision] > DECISION_RANK[r.engineDecision]) out.push({ label: lv.label, becomes: res.engineDecision, score: res.score });
  }
  void all;
  return out.sort((x, y) => DECISION_RANK[y.becomes] - DECISION_RANK[x.becomes] || x.label.length - y.label.length).slice(0, 4);
}

export { CITY_BY_NAME };

const FIELD_LABEL: Record<string, string> = { investment: "Investment", size: "Space size", floor: "Floor", space: "Space status", launch: "Target launch", experience: "Retail experience" };

/** Use values the applicant wrote in the notes for cells left blank. Never overrides a filled cell. */
function applyFills(app: Application, f: import("./types").Fills): { app: Application; filled: Record<string, string> } {
  const out = { ...app };
  const filled: Record<string, string> = {};
  if (f.investment && out.investment === null) (out.investment = f.investment), (filled.investment = `₹${f.investment} lakh`);
  if (f.size && out.size === null && out.space !== "Not yet identified") (out.size = f.size), (filled.size = `${f.size} sq ft`);
  if (f.floor && (out.floor === null || out.floor === "Not known")) (out.floor = f.floor), (filled.floor = f.floor);
  if (f.space && out.space === null) (out.space = f.space), (filled.space = f.space);
  if (f.launch && out.launch === null) (out.launch = f.launch), (filled.launch = `${f.launch} months`);
  if (f.experience !== undefined && out.experience === null) (out.experience = f.experience), (filled.experience = `${f.experience} years`);
  return { app: out, filled };
}
