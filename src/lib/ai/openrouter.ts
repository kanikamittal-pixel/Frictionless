import "server-only";

// Gemini Flash via OpenRouter. Every call asks for JSON, has a hard timeout,
// and falls through a list of models; callers always have a rule-based
// fallback, so an AI failure never blocks a decision.

const URL = "https://openrouter.ai/api/v1/chat/completions";

export function aiConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

function models(speed: "fast" | "smart"): string[] {
  const smart = process.env.AI_MODEL || "google/gemini-3.7-flash";
  const fast = process.env.AI_MODEL_FAST || "google/gemini-3.6-flash";
  const fb = process.env.AI_MODEL_FALLBACK || "google/gemini-3.5-flash-lite";
  return [...new Set(speed === "fast" ? [fast, fb, smart] : [smart, fast, fb])];
}

export async function callJson<T>(opts: { system: string; user: string; speed?: "fast" | "smart"; timeoutMs?: number; maxTokens?: number; temperature?: number }): Promise<{ data: T; model: string }> {
  if (!aiConfigured()) throw new Error("AI key not configured");
  const deadline = Date.now() + (opts.timeoutMs ?? 25000);
  let lastErr: unknown = null;
  for (const model of models(opts.speed ?? "smart")) {
    const left = deadline - Date.now();
    if (left < 2500) break;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), left);
    try {
      const res = await fetch(URL, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "X-Title": "Frictionless franchise engine",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: opts.system },
            { role: "user", content: opts.user },
          ],
          response_format: { type: "json_object" },
          reasoning: { effort: "low" },
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.maxTokens ?? 4000,
        }),
      });
      if (!res.ok) throw new Error(`${model} ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const j = await res.json();
      const text: string = j.choices?.[0]?.message?.content ?? "";
      return { data: parseJson<T>(text), model };
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("AI call failed");
}

function parseJson<T>(text: string): T {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try {
    return JSON.parse(t) as T;
  } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error("AI did not return JSON");
  }
}
