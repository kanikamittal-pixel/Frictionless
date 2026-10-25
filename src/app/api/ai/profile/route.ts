import { callJson } from "@/lib/ai/openrouter";
import { buildProfile, INDUSTRIES, MODELS, sanitizeProfile } from "@/lib/engine/brand";
import type { BrandProfile } from "@/lib/engine/types";

// For an industry or business model that isn't in the preset list: start from
// the closest preset and let the AI adjust the numbers. The team reviews the
// result before anything runs.

export async function POST(req: Request) {
  const { industry, model } = (await req.json()) as { industry: string; model: string };
  try {
    const r = await callJson<{ industryKey: string; modelKey: string; overrides: Partial<BrandProfile> }>({
      speed: "smart",
      timeoutMs: 25000,
      system: `You are a franchise-expansion analyst for Indian retail (Karnataka; Tier 1 = Bengaluru, Tier 2 = Mysuru etc., Tier 3 = Tumakuru, Davanagere).
Given a brand's industry and business model in free text, pick the closest preset and adjust its numbers.
Industry presets: ${INDUSTRIES.map((i) => `${i.key} (${i.label})`).join(", ")}.
Model presets: ${MODELS.map((m) => `${m.key} (${m.label}: ${m.hint})`).join(", ")}.
Return JSON {"industryKey", "modelKey", "overrides": {
 "sqft": {"min","idealMin","idealMax","max"}, "capexLakh": {"Tier 1","Tier 2","Tier 3"} (partner-funded setup cost in ₹ lakh),
 "relevantWords": [lowercase stems of directly relevant trades], "adjacentWords": [lowercase stems of adjacent trades],
 "footfall": "high"|"medium"|"low", "groundCritical": boolean, "mallFit": "good"|"ok"|"poor", "partnerOperates": boolean, "needsExistingBusiness": boolean,
 "leadMonths": {"withSpace","withoutSpace"}, "staff": number, "licences": [strings],
 "training": [{"title","days"}], "revenueLakhPerMonth": {"Tier 1","Tier 2","Tier 3"}, "marginPct": number, "triggers": [lowercase places that trigger purchases] }}
Use realistic Indian market numbers. Omit a field to keep the preset value.`,
      user: JSON.stringify({ industry, model }),
    });
    const base = buildProfile(r.data.industryKey, r.data.modelKey, industry, model);
    const o = r.data.overrides ?? {};
    const merged = sanitizeProfile({ ...base, ...o, industry, model, industryKey: base.industryKey, modelKey: base.modelKey } as BrandProfile);
    merged.summary = `${industry}, ${model} (closest preset: ${INDUSTRIES.find((i) => i.key === base.industryKey)?.label} / ${MODELS.find((m) => m.key === base.modelKey)?.label}). Ideal space ${merged.sqft.idealMin}–${merged.sqft.idealMax} sq ft; partner capital ₹${merged.capexLakh["Tier 1"]}L / ₹${merged.capexLakh["Tier 2"]}L / ₹${merged.capexLakh["Tier 3"]}L.`;
    return Response.json({ profile: merged, model: r.model });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
