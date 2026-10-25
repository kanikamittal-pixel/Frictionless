import { callJson } from "@/lib/ai/openrouter";

// Pattern finder: reads combined batch statistics (and recorded store
// outcomes, when there are any) and proposes rubric changes. Proposals only —
// the team approves a new rubric version in the Rubric tab.

export async function POST(req: Request) {
  const { stats, rubric } = (await req.json()) as { stats: unknown; rubric: unknown };
  try {
    const r = await callJson<{ summary: string; findings: string[]; changes: { group: string; key: string; to: number; why: string }[] }>({
      speed: "smart",
      timeoutMs: 30000,
      system: `You are a retail franchise-expansion strategist reviewing how a partner-scoring rubric performs.
You get the current rubric (weights per factor out of 100 within each group, tier minimum scores) and statistics across all processed batches: decision mix, average factor scores by decision, rejection reasons, territory demand vs slots, latent demand outside the plan, data-quality issue counts, and recorded outcomes (did approved stores open on time, payback months) when available.
Return JSON {"summary": 2 sentences, "findings": [3-5 short evidence-based observations citing numbers], "changes": [0-4 proposed changes {"group": "partner" | "location" | "approveMin", "key": factor key or "Tier 1"/"Tier 2"/"Tier 3", "to": new number, "why": one sentence citing the evidence}]}.
Be conservative: move a weight by at most 5 points, and only when the evidence supports it. With fewer than 5 recorded outcomes, say the evidence is thin and prefer zero or one change. Weights within a group must still add to 100 — if you raise one, lower another in the same group.`,
      user: JSON.stringify({ rubric, stats }),
    });
    return Response.json({ ...r.data, model: r.model });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
