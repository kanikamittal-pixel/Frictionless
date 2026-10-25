import { callJson } from "@/lib/ai/openrouter";
import type { Fills, TextTags } from "@/lib/engine/types";

// Reads the messy free-text columns into tags. Never scores, never decides.

interface In {
  brand: { industry: string; model: string; relevantWords: string[]; adjacentWords: string[]; partnerOperates: boolean };
  apps: { id: string; business: string; notes: string; floor: string | null; space: string | null; size: number | null; experience: number | null; investment: number | null }[];
}

const SYSTEM = `You read the free-text fields of franchise applications for an Indian retail brand and return tags as JSON.
You never score or decide anything. Be literal: only tag what the text says. Return {"tags": {"<id>": {...}}} with, for each id:
- category: what the applicant does now, 2-4 plain words ("footwear retail", "software job", "not stated")
- relevance: "direct" (same category as the brand), "adjacent" (other physical retail or customer-facing trade), "unrelated" (salaried job, non-retail), or "none" (nothing written)
- urgency: "high" (deadline, festival, ASAP), "low" (exploring, no hurry), else "normal"
- deadline: short phrase if one is stated, else ""
- intent: "strong" (researched the brand/market, specific plan), "weak" (generic, any-franchise, empty), else "generic"
- redFlags: short phrases for real risks only, e.g. "Funding depends on a loan", "Possible legal or ownership dispute", "Owner may not be hands-on", "Short-term lease", "Space not ready yet", "Runs another franchise — check non-compete", "Past business closed or made losses"
- positives: short phrases, e.g. "Owns the property", "Strong local roots", "Existing customer base", "Has run more than one outlet", "Relevant management background"
- locationCues: places mentioned near the site, lowercase, e.g. "bus stand", "main road", "hospital", "college", "market", "mall"
- contradictions: only where the text and a structured field (floor, space, size, experience, investment) CANNOT both be true, as one plain sentence each. "5 years in eyewear" with 12 years of total retail experience is NOT a contradiction; "first floor" in notes with floor = Ground IS one.
- fills: ONLY for structured fields that are null / blank / "Not known" in the input, the value the free text clearly states: {"investment": ₹ lakh number, "size": sq ft number, "floor": "Ground"|"Upper"|"Mall unit", "space": "Owned"|"Rented"|"Not yet identified", "launch": months number, "experience": years number}. Omit anything not clearly stated. Use {} when nothing applies.
Red-flag meanings: "Space not ready yet" = a space they already have is under construction or renovation (NOT someone still looking for a space — that is already in the form). "Owner may not be hands-on" = they say someone else will run it or they keep another full-time job. "Funding depends on a loan" = they say they need a loan or financing.
Use the exact red-flag wording above where it fits. Empty arrays when nothing applies.`;

const RELEVANCE = ["direct", "adjacent", "unrelated", "none"] as const;
const URGENCY = ["high", "normal", "low"] as const;
const INTENT = ["strong", "generic", "weak"] as const;
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x: string) => x.trim().slice(0, 140)).slice(0, 5) : []);
const pick = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d);

function cleanFills(v: unknown): Fills {
  const f: Fills = {};
  if (!v || typeof v !== "object") return f;
  const o = v as Record<string, unknown>;
  const num = (x: unknown, max: number) => (typeof x === "number" && x > 0 && x <= max ? x : undefined);
  f.investment = num(o.investment, 1000);
  f.size = num(o.size, 20000);
  f.launch = num(o.launch, 36);
  f.experience = typeof o.experience === "number" && o.experience >= 0 && o.experience <= 50 ? o.experience : undefined;
  if (o.floor === "Ground" || o.floor === "Upper" || o.floor === "Mall unit") f.floor = o.floor;
  if (o.space === "Owned" || o.space === "Rented" || o.space === "Not yet identified") f.space = o.space;
  for (const k of Object.keys(f) as (keyof Fills)[]) if (f[k] === undefined) delete f[k];
  return f;
}

function clean(raw: Record<string, unknown> | undefined): TextTags | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    category: typeof raw.category === "string" && raw.category.trim() ? raw.category.trim().slice(0, 40) : "Not stated",
    relevance: pick(raw.relevance, RELEVANCE, "none"),
    urgency: pick(raw.urgency, URGENCY, "normal"),
    deadline: typeof raw.deadline === "string" && raw.deadline.trim() ? raw.deadline.trim().slice(0, 40) : undefined,
    intent: pick(raw.intent, INTENT, "generic"),
    redFlags: strs(raw.redFlags),
    positives: strs(raw.positives),
    locationCues: strs(raw.locationCues).map((s) => s.toLowerCase()),
    contradictions: strs(raw.contradictions),
    fills: cleanFills(raw.fills),
    source: "ai",
  };
}

export async function POST(req: Request) {
  const body = (await req.json()) as In;
  const chunks: In["apps"][] = [];
  for (let i = 0; i < body.apps.length; i += 7) chunks.push(body.apps.slice(i, i + 7));
  const tags: Record<string, TextTags> = {};
  const failed: string[] = [];
  let model = "";
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const r = await callJson<{ tags: Record<string, Record<string, unknown>> }>({
          speed: "fast",
          temperature: 0,
          timeoutMs: 30000,
          system: SYSTEM,
          user: JSON.stringify({
            brand: `${body.brand.industry} — ${body.brand.model}. Directly relevant trades: ${body.brand.relevantWords.slice(0, 10).join(", ")}. Adjacent: ${body.brand.adjacentWords.slice(0, 12).join(", ")}.`,
            applications: chunk,
          }),
        });
        model = r.model;
        for (const a of chunk) {
          const t = clean(r.data.tags?.[a.id]);
          if (t) tags[a.id] = t;
          else failed.push(a.id);
        }
      } catch {
        failed.push(...chunk.map((a) => a.id));
      }
    }),
  );
  return Response.json({ tags, failed, model });
}
