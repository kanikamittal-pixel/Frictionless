import { callJson } from "@/lib/ai/openrouter";

// Turns one decision record into plain language: an explanation for the
// expansion team, a message to the partner in their language, and the
// onboarding steps in that language. It must not change any number.

interface In {
  record: Record<string, unknown>;
  brand: string;
  language: "Kannada" | "English" | "Hindi";
  steps: { date: string; title: string; detail: string; owner: string }[];
}

export async function POST(req: Request) {
  const b = (await req.json()) as In & { part?: "explain" | "steps" };
  try {
    if (b.part === "steps") {
      if (b.language === "English" || !b.steps.length) return Response.json({ steps: null });
      const r = await callJson<{ steps: { title: string; detail: string }[] }>({
        speed: "fast",
        timeoutMs: 40000,
        maxTokens: 8000,
        system: `Translate franchise onboarding steps into ${b.language}${b.language === "Kannada" ? " (Kannada script)" : " (Devanagari)"} for the partner. Plain, warm, practical language. Keep pin codes, IDs (APP-, TER-, ST-), numbers, ₹ amounts and dates as written. Return {"steps": [{"title", "detail"}]} with exactly the same number of steps, in the same order.`,
        user: JSON.stringify(b.steps.map((s) => ({ title: s.title, detail: s.detail }))),
      });
      const ok = Array.isArray(r.data.steps) && r.data.steps.length === b.steps.length;
      return Response.json({ steps: ok ? r.data.steps : null, model: r.model });
    }
    const r = await callJson<{ explanation: string; partnerMessage: string }>({
      speed: "smart",
      timeoutMs: 28000,
      maxTokens: 3000,
      system: `You explain franchise-partner decisions made by a scoring engine for ${b.brand}.
The decision and every number are final: never change, re-score or second-guess them, and never invent facts that are not in the record.
Return JSON:
{"explanation": "For the expansion team, in English: 3-5 short sentences. Lead with the decision and the single biggest reason, cite the scores and thresholds, name the competing partner or slot if relevant, and end with what would change the outcome (from 'paths') if it is not an Approve.",
 "partnerMessage": "A warm, plain message TO the applicant in ${b.language}${b.language === "Kannada" ? " (Kannada script)" : b.language === "Hindi" ? " (Devanagari)" : ""}, 4-6 sentences: the outcome, the main reason in simple words, and their next step with dates from the steps. For rejections be respectful and say what they could do."}`,
      user: JSON.stringify({ record: b.record, steps: b.steps.slice(0, 6) }),
    });
    return Response.json({ explanation: String(r.data.explanation ?? ""), partnerMessage: String(r.data.partnerMessage ?? ""), model: r.model });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
