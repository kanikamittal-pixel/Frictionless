import type { Factor, Rubric } from "./types";

// The 13 rubric factors, grouped into five named dimensions for display.
// Scoring is unchanged; this is how the team reads it.

export const DIMS = [
  { key: "money", label: "Money", factors: ["financial", "economics"] },
  { key: "site", label: "Site readiness", factors: ["floor", "size", "ownership"] },
  { key: "operator", label: "Operator", factors: ["operational", "local"] },
  { key: "location", label: "Location fit", factors: ["strategic", "demographic", "jtbd", "supply", "competition", "competitors"] },
  { key: "launch", label: "Launch realism", factors: ["speed"] },
] as const;

export interface Dimension {
  key: string;
  label: string;
  score: number; // 0-100
  points: number; // share of the 100-point total
  factors: Factor[];
}

export function dimensions(factors: { key: string; group: string; score: number; weight?: number }[], rubric: Rubric): Dimension[] {
  return DIMS.map((d) => {
    const fs = factors.filter((f) => (d.factors as readonly string[]).includes(f.key));
    const pts = (f: (typeof fs)[number]) => ((f.weight ?? (rubric as unknown as Record<string, Record<string, number>>)[f.group]?.[f.key] ?? 0) * (f.group === "partner" ? rubric.blend.partner : rubric.blend.location)) / 100;
    const total = fs.reduce((a, f) => a + pts(f), 0);
    const got = fs.reduce((a, f) => a + (f.score / 10) * pts(f), 0);
    return { key: d.key, label: d.label, score: total ? Math.round((got / total) * 100) : 0, points: Math.round(total), factors: fs as Factor[] };
  });
}
