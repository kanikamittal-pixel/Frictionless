import { callJson } from "@/lib/ai/openrouter";
import { CITY_BY_NAME } from "@/lib/engine/reference";
import type { Archetype, Locality } from "@/lib/engine/types";

// Best-guess locality for pin codes the built-in map doesn't cover. Labelled
// "AI estimate" everywhere it shows up.

const ARCH: Archetype[] = ["cbd", "high-street", "transit", "it-corridor", "premium-residential", "residential", "peri-urban", "industrial", "unknown"];

export async function POST(req: Request) {
  const { pins } = (await req.json()) as { pins: { pin: string; city: string }[] };
  if (!pins?.length) return Response.json({ localities: {} });
  try {
    const r = await callJson<{ pins: Record<string, { name?: string; archetype?: string; lat?: number; lng?: number; sure?: boolean }> }>({
      speed: "fast",
      temperature: 0,
      timeoutMs: 25000,
      system: `You know Indian postal geography. For each pin code, return the main locality it covers and classify it.
Return {"pins": {"<pin>": {"name": "locality, short", "archetype": one of ${ARCH.join(" | ")}, "lat": number, "lng": number, "sure": boolean}}}.
archetype meanings: cbd = city centre business district; high-street = busy shopping street; transit = bus/rail hub; it-corridor = offices/tech parks; premium-residential; residential; peri-urban = city fringe; industrial.
If you are not confident about a pin, set "sure": false and "archetype": "unknown". Coordinates are approximate centroids.`,
      user: JSON.stringify(pins),
    });
    const out: Record<string, Locality> = {};
    for (const { pin, city } of pins) {
      const g = r.data.pins?.[pin];
      if (!g || !g.name) continue;
      const c = CITY_BY_NAME.get(city);
      const okCoord = c && typeof g.lat === "number" && typeof g.lng === "number" && Math.abs(g.lat - c.lat) < 0.35 && Math.abs(g.lng - c.lng) < 0.35;
      out[pin] = {
        pin,
        name: String(g.name).slice(0, 50),
        archetype: g.sure === false ? "unknown" : ARCH.includes(g.archetype as Archetype) ? (g.archetype as Archetype) : "unknown",
        lat: okCoord ? g.lat : undefined,
        lng: okCoord ? g.lng : undefined,
        confidence: "ai",
      };
    }
    return Response.json({ localities: out, model: r.model });
  } catch (e) {
    return Response.json({ localities: {}, error: String(e) });
  }
}
