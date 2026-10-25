"use client";
import { useMemo } from "react";
import { useStore } from "./store";
import { runEngine } from "./engine/run";
import { applyEdits, diffOutputs, type ChangeEntry, type Edit } from "./engine/patch";
import type { EngineInput, EngineOutput, Rubric, BrandProfile } from "./engine/types";

export function useInput(): EngineInput | null {
  const batch = useStore((s) => s.batch);
  const changes = useStore((s) => s.changes);
  const brand = useStore((s) => s.brand);
  const rubric = useStore((s) => s.rubric);
  const tags = useStore((s) => s.tags);
  const localities = useStore((s) => s.localities);
  const overrides = useStore((s) => s.overrides);
  const competition = useStore((s) => s.competition);
  return useMemo(() => {
    if (!batch) return null;
    const { applications, territories } = applyEdits(batch.applications, batch.territories, changes.flatMap((c) => c.edits));
    return { applications, territories, stores: batch.stores, brand, rubric, tags, localities, overrides, edited: editedMap(changes), competitors: competitorsFor(competition, brand.industryKey) };
  }, [batch, changes, brand, rubric, tags, localities, overrides, competition]);
}

export function useEngine(): { input: EngineInput | null; out: EngineOutput | null } {
  const input = useInput();
  const out = useMemo(() => (input ? runEngine(input) : null), [input]);
  return { input, out };
}

/** Run the engine with extra edits (or a different rubric/brand) and diff it against now. */
export function preview(input: EngineInput, current: EngineOutput, opts: { edits?: Edit[]; rubric?: Rubric; brand?: BrandProfile }) {
  const { applications, territories } = applyEdits(input.applications, input.territories, opts.edits ?? []);
  const edited = { ...(input.edited ?? {}) };
  for (const e of opts.edits ?? []) if (e.entity === "application") edited[e.id] = [...(edited[e.id] ?? []), e.field];
  const next = runEngine({ ...input, applications, territories, edited, rubric: opts.rubric ?? input.rubric, brand: opts.brand ?? input.brand }, { paths: false });
  const touched = [...new Set((opts.edits ?? []).filter((e) => e.entity === "application").map((e) => e.id))];
  const terTouched = (opts.edits ?? []).filter((e) => e.entity === "territory").map((e) => e.id);
  const extra = next.results.filter((r) => r.territoryId && terTouched.includes(r.territoryId)).map((r) => r.id);
  return { next, diff: diffOutputs(current, next, [...touched, ...extra]) };
}

export function editedMap(changes: ChangeEntry[]): Record<string, string[]> {
  const m: Record<string, string[]> = {};
  for (const e of changes.flatMap((c) => c.edits)) if (e.entity === "application") (m[e.id] ??= []).push(e.field);
  return m;
}

/** Competitor estimates for the current brand's category, keyed by pin. */
export function competitorsFor(all: Record<string, import("./engine/types").CompEst>, industryKey: string) {
  const out: Record<string, import("./engine/types").CompEst> = {};
  const prefix = `${industryKey}|`;
  for (const [k, v] of Object.entries(all ?? {})) if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
  return out;
}
