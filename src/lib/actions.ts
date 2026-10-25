"use client";
import { useStore, uid } from "./store";
import { runEngine } from "./engine/run";
import { applyEdits, describeEdit, validateEdit, type ChangeEntry, type DiffRow, type Edit } from "./engine/patch";
import type { Application, BrandProfile, EngineInput, EngineOutput, Override, TextTags } from "./engine/types";
import { editedMap, preview } from "./useEngine";
import { ruleTags } from "./engine/lexicon";
import { aiTags } from "./ai";
import { normId } from "./engine/normalize";

// Imperative helpers shared by the chat, the edit forms and the override box.

export function currentInput(): EngineInput | null {
  const s = useStore.getState();
  if (!s.batch) return null;
  const { applications, territories } = applyEdits(s.batch.applications, s.batch.territories, s.changes.flatMap((c) => c.edits));
  return { applications, territories, stores: s.batch.stores, brand: s.brand, rubric: s.rubric, tags: s.tags, localities: s.localities, overrides: s.overrides, edited: editedMap(s.changes) };
}

export function currentOutput(): { input: EngineInput; out: EngineOutput } | null {
  const input = currentInput();
  return input ? { input, out: runEngine(input, { paths: false }) } : null;
}

export function checkEdits(edits: Edit[]): { ok: Edit[]; errors: string[]; lines: string[] } {
  const cur = currentInput();
  if (!cur) return { ok: [], errors: ["No batch loaded."], lines: [] };
  const ok: Edit[] = [];
  const errors: string[] = [];
  for (const e0 of edits) {
    const e = { ...e0, id: normId(e0.id) };
    const err = validateEdit(e, cur.applications, cur.territories);
    if (err) {
      errors.push(`${e.id}: ${err}`);
      continue;
    }
    // Drop edits that would not change anything ("Floor: Ground → Ground").
    if (e.field !== "*") {
      const before = applyEdits(cur.applications, cur.territories, []);
      const after = applyEdits(cur.applications, cur.territories, [e]);
      const pick = (x: typeof before) => JSON.stringify(e.entity === "application" ? (x.applications.find((a) => a.id === e.id) as unknown as Record<string, unknown>)?.[e.field] : (x.territories.find((t) => t.id === e.id) as unknown as Record<string, unknown>)?.[e.field]);
      if (pick(before) === pick(after)) continue;
    }
    ok.push(e);
  }
  return { ok, errors, lines: ok.map((e) => describeEdit(e, cur.applications, cur.territories)) };
}

const textChanged = (edits: Edit[], id: string) => edits.some((e) => e.id === id && (e.field === "notes" || e.field === "business" || e.field === "*"));

// Tags read before an edit can go stale (e.g. a "notes say upper floor"
// contradiction after the floor is corrected). Contradictions are re-checked
// against the new data; if the free text itself changed, the AI re-reads it.
function retag(tags: Record<string, TextTags>, apps: Application[], brand: BrandProfile, edits: Edit[]) {
  const next = { ...tags };
  const reread: string[] = [];
  for (const id of new Set(edits.filter((e) => e.entity === "application").map((e) => e.id))) {
    const app = apps.find((a) => a.id === id);
    if (!app) continue;
    if (textChanged(edits, id)) {
      delete next[id];
      reread.push(id);
    } else if (next[id]) next[id] = { ...next[id], contradictions: ruleTags(app, brand, editedFields(id, edits)).contradictions };
  }
  return { tags: next, reread };
}

/** Every field the team has corrected for this application, including the pending edits. */
function editedFields(id: string, pending: Edit[]): Set<string> {
  const all = [...useStore.getState().changes.flatMap((c) => c.edits), ...pending];
  return new Set(all.filter((e) => e.entity === "application" && e.id === id).map((e) => e.field));
}

export function previewEdits(edits: Edit[]): DiffRow[] {
  const c = currentOutput();
  if (!c) return [];
  const after = applyEdits(c.input.applications, c.input.territories, edits).applications;
  const { tags } = retag(c.input.tags, after, c.input.brand, edits);
  return preview({ ...c.input, tags }, c.out, { edits }).diff;
}

export function commitEdits(edits: Edit[], message: string, source: ChangeEntry["source"]): ChangeEntry {
  const impact = previewEdits(edits);
  const entry: ChangeEntry = { id: uid(), at: new Date().toISOString(), source, message, edits, impact };
  useStore.getState().addChange(entry);
  const input = currentInput()!;
  const { tags, reread } = retag(useStore.getState().tags, input.applications, input.brand, edits);
  useStore.getState().set({ tags });
  if (reread.length)
    aiTags(input.applications.filter((a) => reread.includes(a.id)), input.brand)
      .then((r) => useStore.getState().set({ tags: { ...useStore.getState().tags, ...r.tags } }))
      .catch(() => {});
  return entry;
}

export function commitOverride(id: string, o: Override | null, message: string) {
  const c = currentOutput();
  const before = c?.out.results.find((r) => r.id === id);
  useStore.getState().setOverride(id, o);
  const entry: ChangeEntry = {
    id: uid(),
    at: new Date().toISOString(),
    source: "override",
    message,
    edits: [],
    impact: before ? [{ id, name: before.app.name, from: before.decision, to: o?.decision ?? before.engineDecision, scoreFrom: before.score, scoreTo: before.score, why: o ? `Team override: ${o.reason}` : "Override removed — engine decision restored", direct: true }] : [],
  };
  useStore.getState().addChange(entry);
}
