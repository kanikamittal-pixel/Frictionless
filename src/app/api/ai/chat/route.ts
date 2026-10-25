import { callJson } from "@/lib/ai/openrouter";
import { APP_FIELDS, TER_FIELDS } from "@/lib/engine/patch";

// The Q&A agent. It answers "why" from the saved decision records, and turns
// new information into structured edits. It never decides: edits go back to
// the engine, and the team previews the impact before applying them.

interface In {
  message: string;
  history: { role: "user" | "assistant"; text: string }[];
  context: Record<string, unknown>;
}

const SYSTEM = `You are Outpost, the expansion team's analyst for franchise-partner decisions.
You receive the full batch: brand profile, rubric, every application with its decision, score, reasons, conditions and "paths" (single changes that would improve its decision), and every territory with capacity and allocation. "focus" holds full factor-level records for the IDs in the question.

Decide what the user wants and return JSON:
{"kind": "answer" | "update" | "override" | "unclear",
 "answer": string,
 "edits": [{"entity": "application" | "territory", "id": string, "field": string, "value": string | number | boolean | object}],
 "assumptions": [string],
 "override": {"id": string, "decision": "Approve" | "Conditional" | "Hold" | "Reject", "reason": string} | null,
 "ids": [IDs you mention]}

kind = "answer" for questions. Answer ONLY from the data. Lead with the direct answer, cite exact scores, thresholds, slot ranks, competing IDs and conditions, and say what would change the outcome using "paths". Keep it under 120 words unless a list is asked for. Plain text; short "- " bullet lines are fine.

kind = "update" when the user gives NEW INFORMATION about an applicant or territory (found a space, raised money, withdrew, slots changed, new applicant...). Translate it into edits; do NOT predict the new decision (the engine recomputes it and shows the before/after). "answer" = one sentence restating what you will change.
 Application fields: ${Object.entries(APP_FIELDS).map(([k, v]) => `${k} (${v})`).join("; ")}.
 Allowed values: space = Owned | Rented | Not yet identified; floor = Ground | Upper | Mall unit | Not known; language = Kannada | English | Hindi; investment in ₹ lakh; size in sq ft; launch in months; withdrawn = true.
 Territory fields: ${Object.entries(TER_FIELDS).map(([k, v]) => `${k} (${v})`).join("; ")}; priority = High | Medium | Low; pins = comma-separated 6-digit pins (give the FULL new list).
 "found a ground-floor space" for someone whose space is "Not yet identified" means: space = Rented (unless they say owned), floor = Ground — list each assumption you make in "assumptions". Only include fields the message supports. If a space becomes identified and its size is not given, say in "answer" that you still need the carpet area (it stays a condition until then).
 A brand-new applicant: entity "application", field "*", value = object of fields, id = next free APP-number.
kind = "override" when the user (the expansion team) explicitly instructs a decision for an ID regardless of score ("approve APP-009 anyway", "reject APP-020"). Include their reason. The team confirms it in the UI.
kind = "unclear" if you cannot tell which application or what changed — ask one short question in "answer".
Rubric weight changes are not done in chat: say they are made in the Rubric tab, where the team previews the impact and approves a new version.`;

export async function POST(req: Request) {
  const b = (await req.json()) as In;
  try {
    const r = await callJson<Record<string, unknown>>({
      speed: "smart",
      timeoutMs: 30000,
      maxTokens: 3000,
      system: SYSTEM,
      user: JSON.stringify({ context: b.context, history: b.history.slice(-6), message: b.message }),
    });
    const d = r.data;
    const kind = ["answer", "update", "override", "unclear"].includes(String(d.kind)) ? String(d.kind) : "answer";
    const edits = Array.isArray(d.edits)
      ? d.edits
          .filter((e: Record<string, unknown>) => e && (e.entity === "application" || e.entity === "territory") && typeof e.id === "string" && typeof e.field === "string")
          .map((e: Record<string, unknown>) => ({ entity: e.entity, id: String(e.id).trim().toUpperCase(), field: String(e.field), value: e.value }))
      : [];
    const ov = d.override as Record<string, unknown> | null | undefined;
    return Response.json({
      kind,
      answer: String(d.answer ?? ""),
      edits,
      assumptions: Array.isArray(d.assumptions) ? d.assumptions.map(String).slice(0, 5) : [],
      override: ov && typeof ov.id === "string" && ["Approve", "Conditional", "Hold", "Reject"].includes(String(ov.decision)) ? { id: String(ov.id).toUpperCase(), decision: ov.decision, reason: String(ov.reason ?? "") } : null,
      ids: Array.isArray(d.ids) ? d.ids.map(String) : [],
      model: r.model,
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
