import type { BrandProfile, EngineOutput, Result } from "./engine/types";
import type { Edit } from "./engine/patch";
import type { ChatReply } from "./ai";
import { normId } from "./engine/normalize";
import { cityForPin } from "./engine/reference";
import { buildPlan, fmtDate } from "./engine/plan";

/** "app 7", "APP-007", "ter1" -> canonical IDs. */
export function mentionedIds(text: string): string[] {
  return [...new Set((text.match(/\b(APP|ROW|TER|ST)[\s\-_]*\d+(#\d)?\b/gi) ?? []).map(normId))];
}

// Rule-based stand-in for the Q&A agent when the AI is unavailable. Handles
// "why is X …", "why X over Y", batch questions (counts, lists, rankings),
// and simple updates.

const answer = (text: string): ChatReply => ({ kind: "answer", answer: text, edits: [], assumptions: [], override: null });
const line = (r: Result) => `${r.id} (${r.app.name || "no name"}) — ${r.app.withdrawn ? "Withdrawn" : r.decision}, score ${r.score}${r.territoryId ? `, ${r.territoryId}` : ""}, pin ${r.app.pin || "?"}`;
const label = (r: Result) => (r.app.withdrawn ? "Withdrawn" : r.decision);

export function rulesChat(message: string, out: EngineOutput, brand?: BrandProfile): ChatReply {
  const m = message.trim();
  const ids = mentionedIds(m);
  const apps = ids.map((id) => out.results.find((r) => r.id === id)).filter((r): r is Result => !!r);
  const app = apps[0];
  const ter = out.territories.find((t) => ids.includes(t.id));
  const low = m.toLowerCase();
  // Numbers inside IDs ("TER-03", "APP-012") must never be read as amounts or counts.
  const bare = low.replace(/\b(app|row|ter|st)[\s\-_]*\d+(#\d)?\b/gi, " ");
  const edits: Edit[] = [];
  const assumptions: string[] = [];

  // An ID that isn't in this batch gets a straight answer, not a list about everyone else.
  const unknown = ids.filter((id) => /^(APP|TER)-/.test(id) && !out.results.some((r) => r.id === id) && !out.territories.some((t) => t.id === id));
  if (unknown.length && !apps.length && !out.territories.some((t) => ids.includes(t.id)))
    return answer(`There's no ${unknown.join(" or ")} in this batch. It has ${out.results.length} applications (${out.results[0]?.id ?? "—"} to ${out.results.at(-1)?.id ?? "—"}) and territories ${out.territories.map((t) => t.id).join(", ") || "none"}.`);

  if (/ignore (your|the|all)? ?rules|approve (everyone|everybody|all)|override (the )?rules/.test(low))
    return answer("I can't approve in bulk or set the rules aside: open slots and the one-store-per-pin rule apply to everyone. To change one decision, open that application and use Override with a reason, or tell me the new facts (\"APP-012 found a ground-floor space\") and I'll re-run it.");

  if (app && apps.length === 1) {
    const id = app.id;
    if (/back in|re-?appl|rejoin|still interested|wants? to continue|un-?withdr|reconsider/.test(low)) edits.push({ entity: "application", id, field: "withdrawn", value: false });
    else if (/withdr|pulled out|backed out|no longer interested/.test(low)) edits.push({ entity: "application", id, field: "withdrawn", value: true });
    if (/ground[- ]floor/.test(low)) edits.push({ entity: "application", id, field: "floor", value: "Ground" });
    else if (/(upper|first|second|1st|2nd)[- ]floor|basement/.test(low)) edits.push({ entity: "application", id, field: "floor", value: "Upper" });
    if (/mall/.test(low) && /(found|got|moved|unit)/.test(low)) edits.push({ entity: "application", id, field: "floor", value: "Mall unit" });
    if (/(found|secured|got|signed).*(space|shop|site|unit|lease)|(space|shop).*(found|secured|signed)/.test(low) && (app.app.space === "Not yet identified" || app.app.space === null)) {
      const owned = /\bown(ed|s)?\b|family property|bought/.test(low);
      edits.push({ entity: "application", id, field: "space", value: owned ? "Owned" : "Rented" });
      if (!owned) assumptions.push("Assumed the new space is rented (ownership not stated).");
    }
    if (/fell through|lost the (space|shop)|no longer (has|have) the (space|shop)/.test(low) && !/found|got|secured/.test(low))
      edits.push({ entity: "application", id, field: "space", value: "Not yet identified" });
    const pin = bare.match(/\b(\d{3})\s?(\d{3})\b/);
    if (pin && /(move|shift|relocat|switch|found|space in|shop in|pin|instead)/.test(low)) {
      const p = pin[1] + pin[2];
      if (p !== app.app.pin) {
        edits.push({ entity: "application", id, field: "pin", value: p });
        const c = cityForPin(p);
        if (c && c.name !== app.app.city) edits.push({ entity: "application", id, field: "city", value: c.name });
      }
    }
    const sq = bare.match(/(\d{2,5})\s*(sq|sqft|square)/);
    if (sq) edits.push({ entity: "application", id, field: "size", value: +sq[1] });
    const inv = bare.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(lakh|lac|l\b|cr|crore)/);
    if (inv && /(invest|capital|fund|raise|budget|money|loan|sanction|add|more|extra|top up|contribut)/.test(low)) {
      const n = +inv[1] * (/cr/.test(inv[2]) ? 100 : 1);
      // "A cousin will add 25 lakh" is on top of what they had; "can now invest 20 lakh" is the new total.
      const extra = /\b(add|adds|adding|more|extra|additional|top up|another|contribut\w*|co-?invest\w*)\b/.test(low) && app.app.investment !== null;
      edits.push({ entity: "application", id, field: "investment", value: extra ? app.app.investment! + n : n });
      if (extra) assumptions.push(`Added ₹${n}L to the existing ₹${app.app.investment}L — ask for proof of funds and, for a co-investor, the partnership terms.`);
    }
    if (/loan\b.{0,25}\b(sanction|approv)/.test(low))
      edits.push({ entity: "application", id, field: "notes", value: `${app.app.notes} [Update: loan sanctioned]`.trim() });
    const mo = bare.match(/(\d+)\s*months?/);
    if (mo && /(launch|open)/.test(low)) edits.push({ entity: "application", id, field: "launch", value: +mo[1] });
    const exp = bare.match(/(\d+)\s*(years?|yrs?)/);
    const runs = m.match(/\b(runs|ran|owns|manages|managed)\s+(an?\s+[^.,;]+?)(?:\s+for\b|[.,;]|$)/i);
    if (exp && /experience/.test(low)) edits.push({ entity: "application", id, field: "experience", value: +exp[1] });
    else if (exp && runs) edits.push({ entity: "application", id, field: "experience", value: +exp[1] });
    if (runs) edits.push({ entity: "application", id, field: "business", value: `${runs[1].charAt(0).toUpperCase()}${runs[1].slice(1)} ${runs[2]}` });
    const name = m.match(/\b(?:name(?:\s+is)?|named|called)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z.]+)+)/);
    if (name) edits.push({ entity: "application", id, field: "name", value: name[1] });
    for (const l of ["Kannada", "Hindi", "English"]) if (new RegExp(`(prefers|training in|language).*${l.toLowerCase()}`).test(low)) edits.push({ entity: "application", id, field: "language", value: l });
    if (edits.length) return { kind: "update", answer: `Updating ${id} with the new information.`, edits, assumptions, override: null };

    // Questions about one application.
    if (/onboarding|plan|when (exactly )?can|open date|next \d+ days|need to do|next steps?|timeline/.test(low) && brand) {
      const plan = buildPlan(app, brand);
      const head = [`${line(app)}.`, app.headline];
      if (plan.openDate) head.push(`Realistic opening: ${fmtDate(plan.openDate)} (${plan.note || `about ${Math.round(plan.openDay / 30)} months`}). Training: ${plan.trainingDays} days in ${app.app.language ?? "English"}.`);
      const within = /next (\d+) days/.exec(low);
      const steps = within ? plan.steps.filter((s) => s.day <= +within[1]) : plan.steps;
      return answer([...head, "Plan:", ...steps.map((s) => `- ${fmtDate(s.date)} · ${s.phase} · ${s.title} (${s.owner}) — ${s.detail}`)].join("\n"));
    }
    const lines = [`${line(app)} (bar ${app.threshold}).`, app.headline];
    if (app.reasons.length) lines.push("What drove it:", ...app.reasons.map((r) => `- ${r}`));
    const notable = app.issues.filter((i) => i.severity !== "info");
    if (notable.length) lines.push("Flags:", ...notable.map((i) => `- ${i.message}`));
    if (app.flags.length) lines.push(...app.flags.map((f) => `- ${f}`));
    if (/experience|business|run|operat/.test(low)) lines.push(`Form: ${app.app.experience ?? "blank"} years retail experience; business: "${app.app.business || "—"}". Notes: "${app.app.notes || "—"}".`);
    if (app.conditions.length) lines.push("Conditions:", ...app.conditions.map((c) => `- ${c.text}`));
    if (app.paths.length) lines.push("What would change it:", ...app.paths.map((p) => `- ${p.label} → ${p.becomes} (${p.score})`));
    if (app.alternatives.length) lines.push(`Open pins nearby: ${app.alternatives.map((a) => `${a.pin} (${a.territory})`).join(", ")}.`);
    if (/payback/.test(low) && app.payback) lines.push(`Payback estimate: setup ₹${app.payback.capex}L ÷ about ₹${app.payback.monthlyProfit}L profit a month ≈ ${app.payback.months} months (brand averages for a ${app.tier ?? "Tier 2"} store; not a forecast for this site).`);
    return answer(lines.join("\n"));
  }

  // Two applications: compare them.
  if (apps.length >= 2) {
    const [a, b] = apps;
    const diffs = a.factors
      .map((f) => ({ f, g: b.factors.find((x) => x.key === f.key) }))
      .filter((x) => x.g && Math.abs(x.f.score - x.g.score) >= 0.5)
      .sort((x, y) => Math.abs(y.f.score - y.g!.score) * y.f.weight - Math.abs(x.f.score - x.g!.score) * x.f.weight)
      .slice(0, 4);
    const lines = [`${line(a)}.`, `${line(b)}.`, `${a.id}: ${a.headline}`, `${b.id}: ${b.headline}`];
    if (diffs.length) lines.push("Biggest differences:", ...diffs.map(({ f, g }) => `- ${f.label}: ${a.id} ${f.score}/10 vs ${b.id} ${g!.score}/10 — ${f.score > g!.score ? f.evidence : g!.evidence}`));
    else lines.push("They score the same on every factor; the tie-break is named in the headline above.");
    return answer(lines.join("\n"));
  }

  if (ter) {
    if (/close[sd]?\b|shut|pause|no longer|stop(s|ped)? (growing|expanding)/.test(low)) return { kind: "update", answer: `Closing ${ter.id}: open slots set to 0.`, edits: [{ entity: "territory", id: ter.id, field: "slots", value: 0 }], assumptions: ["Closing a territory is modelled as 0 open slots; its applicants move to the waitlist."], override: null };
    const slots = bare.match(/(\d+)\s*(more\s*)?(open\s*)?slots?|slots?\s*(?:to|=|is|are|now|at)?\s*(\d+)/);
    if (slots) {
      const n = +(slots[1] ?? slots[4]);
      const more = !!slots[2] || /\b(add|adds|another|extra)\b/.test(low);
      return { kind: "update", answer: `Updating ${ter.id} open slots.`, edits: [{ entity: "territory", id: ter.id, field: "slots", value: more ? (ter.territory.slots ?? 0) + n : n }], assumptions: [], override: null };
    }
    const pr = low.match(/priority\s*(?:to|=|is|now)?\s*(high|medium|low)/);
    if (pr) return { kind: "update", answer: `Updating ${ter.id} priority.`, edits: [{ entity: "territory", id: ter.id, field: "priority", value: pr[1] }], assumptions: [], override: null };
    const rs = out.results.filter((r) => r.territoryId === ter.id).sort((x, y) => y.score - x.score);
    return answer([`${ter.id} (${ter.territory.city}): ${ter.capacity} usable slot(s), ${rs.length} applicant(s). ${ter.note}`, "Ranking:", ...rs.map((r, i) => `${i + 1}. ${line(r)} — ${r.headline}`)].join("\n"));
  }

  // Batch questions: no ID mentioned.
  const all = out.results;
  if (/same person|duplicate|look(s)? like the same|twice/.test(low)) {
    const d = all.filter((r) => r.issues.some((i) => i.code === "dup-person" || i.code === "same-person"));
    return answer(d.length ? ["Likely the same applicant:", ...d.map((r) => `- ${r.id} (${r.app.name}, pin ${r.app.pin}): ${r.issues.find((i) => i.code === "dup-person" || i.code === "same-person")!.message}`)].join("\n") : "No applications look like the same person.");
  }
  if (/already (has|have) a store|existing store|store pin|pin that already/.test(low)) {
    const d = all.filter((r) => out.territories.some((t) => t.blockedPins.some((b) => b.pin === r.app.pin)) || /already has store/.test(r.headline));
    return answer(d.length ? ["Asked for a pin that already has a store:", ...d.map((r) => `- ${line(r)} — ${r.headline}`)].join("\n") : "Nobody asked for a pin that already has a store.");
  }
  if (/redirect|could (move|be moved)|alternative|other pin/.test(low)) {
    const d = all.filter((r) => r.decision !== "Approve" && r.alternatives.length);
    return answer(d.length ? ["Could be redirected to an open pin:", ...d.map((r) => `- ${r.id} (${label(r)}, pin ${r.app.pin}) → ${r.alternatives.map((a) => `${a.pin} (${a.territory})`).join(", ")}`)].join("\n") : "No open pins are left for a redirect: every territory with room is already filled.");
  }
  const summary = /summary|per territory|each territory|all territories|over-?fill|exceed|how many|count|total|stores will open/.test(low);
  if (!summary && /waiting|waitlist|territory to open|on hold/.test(low)) {
    // "Waiting for a territory to open" means no territory or no slot, not a weak score.
    const forTerritory = /territory to open|territory opens|new territory/.test(low);
    const d = all.filter((r) => r.decision === "Hold" && !r.app.withdrawn && (!forTerritory || r.gate === "fail" || /no open slot/.test(r.headline)));
    return answer(d.length ? [forTerritory ? "Waiting for a territory or slot to open:" : "Waiting:", ...d.map((r) => `- ${line(r)} — ${r.headline}`)].join("\n") : "Nobody is waiting.");
  }
  if (summary) {
    const c = out.summary.counts;
    const lines = [`${c.Approve} approve, ${c.Conditional} conditional, ${c.Hold} hold, ${c.Reject} reject (of ${out.summary.total}). Slots: ${out.summary.slotsFilled} of ${out.summary.slotsOpen} usable slots filled.`];
    for (const t of out.territories) lines.push(`- ${t.id} (${t.territory.city}): ${t.territory.slots ?? 0} open slot(s), ${t.capacity} usable; given to ${t.allocated.join(", ") || "nobody"}; waitlist ${t.waitlist.join(", ") || "none"}. ${t.note}`);
    const over = out.territories.filter((t) => t.allocated.length > t.capacity);
    const won = all.filter((r) => r.slot === "won");
    const pins = won.map((r) => r.app.pin);
    const twice = pins.filter((p, i) => pins.indexOf(p) !== i);
    lines.push(over.length ? `Over-filled: ${over.map((t) => t.id).join(", ")}.` : "No territory exceeds its slots.", twice.length ? `Pins used twice: ${twice.join(", ")}.` : "No pin is used twice, and no slot is on a pin that already has a store.");
    return answer(lines.join("\n"));
  }
  if (/status of all|all (the )?applications|final status|every application|table|list (all|every)/.test(low))
    return answer(["Status of every application:", ...all.map((r) => `- ${line(r)} — ${r.headline}`)].join("\n"));
  if (/rank/.test(low))
    return answer(["All applications by score:", ...[...all].sort((a, b) => b.score - a.score).map((r, i) => `${i + 1}. ${line(r)}`)].join("\n"));
  if (/contested|competition|oversubscribed|most demand/.test(low)) {
    const t = out.territories.filter((x) => x.capacity > 0).sort((a, b) => b.demandRatio - a.demandRatio || b.waitlist.length - a.waitlist.length)[0];
    return answer(t ? `${t.id} is the most contested: ${t.applicants.length} applicants for ${t.capacity} slot(s). ${t.note}` : "No territories loaded.");
  }
  const c = out.summary.counts;
  return { kind: "unclear", answer: `I can explain any decision or apply new information — mention an ID, e.g. "Why is APP-007 on hold?" or "APP-012 has found a ground-floor space". I can also summarise territories, list duplicates, store-pin clashes, the waitlist or redirect options. This batch: ${c.Approve} approve, ${c.Conditional} conditional, ${c.Hold} hold, ${c.Reject} reject.`, edits: [], assumptions: [], override: null };
}
