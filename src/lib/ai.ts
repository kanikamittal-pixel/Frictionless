"use client";
import type { Application, BrandProfile, CompEst, EngineInput, EngineOutput, Locality, Result, TextTags } from "./engine/types";
import { GAZETTEER, cityForPin } from "./engine/reference";
import type { Edit } from "./engine/patch";
import { buildPlan } from "./engine/plan";
import { mentionedIds } from "./chatRules";

async function post<T>(url: string, body: unknown, timeoutMs = 35000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
    return j as T;
  } finally {
    clearTimeout(t);
  }
}

export async function aiTags(apps: Application[], brand: BrandProfile) {
  return post<{ tags: Record<string, TextTags>; failed: string[]; model: string }>("/api/ai/tags", {
    brand: { industry: brand.industry, model: brand.model, relevantWords: brand.relevantWords, adjacentWords: brand.adjacentWords, partnerOperates: brand.partnerOperates },
    apps: apps.map((a) => ({ id: a.id, business: a.business, notes: a.notes, floor: a.floor, space: a.space, size: a.size, experience: a.experience, investment: a.investment })),
  });
}

export async function aiLocalities(pins: string[], known: Record<string, Locality>) {
  const need = [...new Set(pins)].filter((p) => p && !GAZETTEER[p] && !known[p] && cityForPin(p)).map((p) => ({ pin: p, city: cityForPin(p)!.name }));
  if (!need.length) return { localities: {} as Record<string, Locality> };
  return post<{ localities: Record<string, Locality> }>("/api/ai/localities", { pins: need });
}

export async function aiCompetitors(pins: string[], brand: BrandProfile, localities: Record<string, Locality>) {
  const list = [...new Set(pins)].filter((p) => p && cityForPin(p)).map((p) => ({ pin: p, city: cityForPin(p)!.name, locality: (GAZETTEER[p] ?? localities[p])?.name }));
  if (!list.length) return { estimates: {} as Record<string, CompEst> };
  return post<{ estimates: Record<string, CompEst> }>("/api/ai/competitors", { category: brand.industry, pins: list }, 30000);
}

export function compactRecord(r: Result) {
  return {
    id: r.id, name: r.app.name, decision: r.decision, engineDecision: r.engineDecision, override: r.override ?? null,
    headline: r.headline, score: r.score, threshold: r.threshold, partnerScore: r.partnerScore, locationScore: r.locationScore,
    territory: r.territoryId, tier: r.tier, pin: r.app.pin, city: r.app.city, locality: r.locality?.name, slot: r.slot, rank: r.rank,
    pinRival: r.pinRival, nextInLine: r.nextInLine,
    dimensions: r.dimensions.map((d) => ({ dimension: d.label, score: d.score })),
    factors: r.factors.map((f) => ({ factor: f.label, score: f.score, weight: f.weight, evidence: f.evidence, assumed: !!f.assumed })),
    conditions: r.conditions.map((c) => c.text), paths: r.paths, alternatives: r.alternatives, flags: r.flags,
    issues: r.issues.filter((i) => i.severity !== "info").map((i) => i.message), payback: r.payback, buddyStore: r.buddyStore,
    application: { investment: r.app.investment, experience: r.app.experience, business: r.app.business, space: r.app.space, size: r.app.size, floor: r.app.floor, launch: r.app.launch, language: r.app.language, notes: r.app.notes },
  };
}

export async function aiBrief(r: Result, brand: BrandProfile, language: "Kannada" | "English" | "Hindi", part: "explain" | "steps") {
  const plan = buildPlan(r, brand);
  return post<{ explanation?: string; partnerMessage?: string; steps?: { title: string; detail: string }[] | null; model?: string }>("/api/ai/brief", {
    part,
    record: compactRecord(r),
    brand: `${brand.industry} (${brand.model})`,
    language,
    steps: plan.steps.map((s) => ({ date: s.date, title: s.title, detail: s.detail, owner: s.owner })),
  }, 45000);
}

export function chatContext(input: EngineInput, out: EngineOutput, message: string) {
  const ids = mentionedIds(message);
  const focus = out.results.filter((r) => ids.includes(r.id)).map(compactRecord);
  const terFocus = out.territories.filter((t) => ids.includes(t.id));
  return {
    brand: `${input.brand.industry} — ${input.brand.model}. ${input.brand.summary}`,
    rubric: { version: input.rubric.version, blend: input.rubric.blend, partnerWeights: input.rubric.partner, locationWeights: input.rubric.location, approveMinByTier: input.rubric.approveMin, conditionalMin: input.rubric.conditionalMin, rejectBelow: input.rubric.rejectBelow, rules: "Phase 1 territory gate (strict if any app matches a territory pin, else fallback flag); never two stores in one pin (existing stores included); best score wins each slot; a strong partner who loses a pin may be offered a free pin in the same territory." },
    summary: out.summary,
    latentDemand: out.latentDemand,
    applications: out.results.map((r) => ({
      id: r.id, name: r.app.name, city: r.app.city, pin: r.app.pin, inv: r.app.investment, exp: r.app.experience, biz: r.app.business, space: r.app.space, size: r.app.size, floor: r.app.floor, launch: r.app.launch, lang: r.app.language, notes: r.app.notes, withdrawn: !!r.app.withdrawn,
      decision: r.decision, score: r.score, bar: r.threshold, P: r.partnerScore, L: r.locationScore, ter: r.territoryId, slot: r.slot, rank: r.rank, headline: r.headline,
      conditions: r.conditions.map((c) => c.text), paths: r.paths.map((p) => `${p.label} → ${p.becomes} (${p.score})`),
    })),
    territories: out.territories.map((t) => ({ id: t.id, city: t.territory.city, pins: t.territory.pins, tier: t.territory.tier, slots: t.territory.slots, priority: t.territory.priority, capacity: t.capacity, blockedByStores: t.blockedPins, allocated: t.allocated, waitlist: t.waitlist, applicants: t.applicants, note: t.note })),
    existingStores: input.stores,
    focus,
    territoryFocus: terFocus,
  };
}

export interface ChatReply {
  kind: "answer" | "update" | "override" | "unclear";
  answer: string;
  edits: Edit[];
  assumptions: string[];
  override: { id: string; decision: "Approve" | "Conditional" | "Hold" | "Reject"; reason: string } | null;
  model?: string;
}

export async function aiChat(message: string, history: { role: "user" | "assistant"; text: string }[], context: unknown) {
  return post<ChatReply>("/api/ai/chat", { message, history, context }, 40000);
}

export async function aiProfile(industry: string, model: string) {
  return post<{ profile: BrandProfile; model: string }>("/api/ai/profile", { industry, model }, 35000);
}

export async function aiPatterns(stats: unknown, rubric: unknown) {
  return post<{ summary: string; findings: string[]; changes: { group: string; key: string; to: number; why: string }[]; model: string }>("/api/ai/patterns", { stats, rubric }, 40000);
}

export async function saveBatch(body: unknown) {
  try {
    await post("/api/batch", body, 15000);
  } catch {
    /* the browser copy is the fallback */
  }
}
