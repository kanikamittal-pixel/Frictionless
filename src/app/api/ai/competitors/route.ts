import { callJson } from "@/lib/ai/openrouter";
import type { CompEst, CompLevel } from "@/lib/engine/types";

// Competitor density per pin code for the brand's category, from the model's
// knowledge of Indian localities. An estimate, labelled as such everywhere.

const LEVELS: CompLevel[] = ["none", "few", "some", "many"];

export async function POST(req: Request) {
  const { category, pins } = (await req.json()) as { category: string; pins: { pin: string; city: string; locality?: string }[] };
  if (!pins?.length) return Response.json({ estimates: {} });
  try {
    const r = await callJson<{ pins: Record<string, { level?: string; note?: string }> }>({
      speed: "fast",
      temperature: 0,
      timeoutMs: 25000,
      system: `You know Indian retail geography. For each pin code, estimate how many competing ${category} businesses (other brands and independents) are within about 1 km of the area's main market, relative to what is normal for this category.
Return {"pins": {"<pin>": {"level": "none" | "few" | "some" | "many", "note": "under 60 characters, e.g. 'busy optical cluster on 100 ft Road'"}}}.
none = practically no such shops; few = 1–3; some = 4–7; many = 8+ / a known cluster. If unsure, judge from how commercial the locality is and say "estimate" in the note.`,
      user: JSON.stringify(pins),
    });
    const out: Record<string, CompEst> = {};
    for (const { pin } of pins) {
      const g = r.data.pins?.[pin];
      if (!g || !LEVELS.includes(g.level as CompLevel)) continue;
      out[pin] = { level: g.level as CompLevel, note: String(g.note ?? "").slice(0, 60), source: "ai" };
    }
    return Response.json({ estimates: out, model: r.model });
  } catch (e) {
    return Response.json({ estimates: {}, error: String(e) });
  }
}
