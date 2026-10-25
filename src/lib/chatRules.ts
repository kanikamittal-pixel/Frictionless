import type { EngineOutput } from "./engine/types";
import type { Edit } from "./engine/patch";
import type { ChatReply } from "./ai";
import { normId } from "./engine/normalize";

/** "app 7", "APP-007", "ter1" -> canonical IDs. */
export function mentionedIds(text: string): string[] {
  return [...new Set((text.match(/\b(APP|ROW|TER|ST)[\s\-_]*\d+(#\d)?\b/gi) ?? []).map(normId))];
}

// Rule-based stand-in for the Q&A agent when the AI is unavailable. Handles
// the common shapes: "why is X …", "what would X need", and simple updates.

export function rulesChat(message: string, out: EngineOutput): ChatReply {
  const m = message.trim();
  const ids = mentionedIds(m);
  const app = out.results.find((r) => ids.includes(r.id));
  const ter = out.territories.find((t) => ids.includes(t.id));
  const low = m.toLowerCase();
  const edits: Edit[] = [];
  const assumptions: string[] = [];

  if (app) {
    const id = app.id;
    if (/withdr|pulled out|backed out|no longer interested/.test(low)) edits.push({ entity: "application", id, field: "withdrawn", value: true });
    if (/ground[- ]floor/.test(low)) edits.push({ entity: "application", id, field: "floor", value: "Ground" });
    if (/mall/.test(low) && /(found|got|moved|unit)/.test(low)) edits.push({ entity: "application", id, field: "floor", value: "Mall unit" });
    if (/(found|secured|got|signed).*(space|shop|site|unit)|(space|shop).*(found|secured)/.test(low) && (app.app.space === "Not yet identified" || app.app.space === null)) {
      const owned = /\bown(ed|s)?\b|family property|bought/.test(low);
      edits.push({ entity: "application", id, field: "space", value: owned ? "Owned" : "Rented" });
      if (!owned) assumptions.push("Assumed the new space is rented (ownership not stated).");
    }
    const sq = low.match(/(\d{3,5})\s*(sq|sqft|square)/);
    if (sq) edits.push({ entity: "application", id, field: "size", value: +sq[1] });
    const inv = low.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(lakh|lac|l\b|cr|crore)/);
    if (inv && /(invest|capital|fund|raise|budget|money|loan|sanction)/.test(low)) edits.push({ entity: "application", id, field: "investment", value: `${inv[1]} ${inv[2]}` });
    const mo = low.match(/(\d+)\s*months?/);
    if (mo && /(launch|open)/.test(low)) edits.push({ entity: "application", id, field: "launch", value: +mo[1] });
    const exp = low.match(/(\d+)\s*(years?|yrs?)/);
    if (exp && /experience/.test(low)) edits.push({ entity: "application", id, field: "experience", value: +exp[1] });
    for (const l of ["Kannada", "Hindi", "English"]) if (new RegExp(`(prefers|training in|language).*${l.toLowerCase()}`).test(low)) edits.push({ entity: "application", id, field: "language", value: l });
    if (edits.length) return { kind: "update", answer: `Updating ${id} with the new information.`, edits, assumptions, override: null };

    const lines = [`${id} (${app.app.name || "no name"}) — ${app.decision}, score ${app.score} (bar ${app.threshold}).`, app.headline];
    if (app.conditions.length) lines.push("Conditions:", ...app.conditions.map((c) => `- ${c.text}`));
    if (app.paths.length) lines.push("What would change it:", ...app.paths.map((p) => `- ${p.label} → ${p.becomes} (${p.score})`));
    if (app.alternatives.length) lines.push(`Open pins nearby: ${app.alternatives.map((a) => `${a.pin} (${a.territory})`).join(", ")}.`);
    return { kind: "answer", answer: lines.join("\n"), edits: [], assumptions: [], override: null };
  }
  if (ter) {
    const slots = low.match(/(\d+)\s*(open\s*)?slots?|slots?\s*(?:to|=|is|are|now)?\s*(\d+)/);
    if (slots) return { kind: "update", answer: `Updating ${ter.id} open slots.`, edits: [{ entity: "territory", id: ter.id, field: "slots", value: +(slots[1] ?? slots[3]) }], assumptions: [], override: null };
    const pr = low.match(/priority\s*(?:to|=|is|now)?\s*(high|medium|low)/);
    if (pr) return { kind: "update", answer: `Updating ${ter.id} priority.`, edits: [{ entity: "territory", id: ter.id, field: "priority", value: pr[1] }], assumptions: [], override: null };
    return { kind: "answer", answer: `${ter.id} (${ter.territory.city}): ${ter.capacity} usable slot(s), ${ter.applicants.length} applicant(s). Allocated: ${ter.allocated.join(", ") || "none"}. Waitlist: ${ter.waitlist.join(", ") || "none"}. ${ter.note}`, edits: [], assumptions: [], override: null };
  }
  if (/contested|competition|oversubscribed|most demand/.test(low)) {
    const t = out.territories.filter((x) => x.capacity > 0).sort((a, b) => b.demandRatio - a.demandRatio || b.waitlist.length - a.waitlist.length)[0];
    return { kind: "answer", answer: t ? `${t.id} is the most contested: ${t.applicants.length} applicants for ${t.capacity} slot(s). ${t.note}` : "No territories loaded.", edits: [], assumptions: [], override: null };
  }
  const c = out.summary.counts;
  return { kind: "unclear", answer: `I can explain any decision or apply new information — mention an ID, e.g. "Why is APP-007 on hold?" or "APP-012 has found a ground-floor space". This batch: ${c.Approve} approve, ${c.Conditional} conditional, ${c.Hold} hold, ${c.Reject} reject.`, edits: [], assumptions: [], override: null };
}
