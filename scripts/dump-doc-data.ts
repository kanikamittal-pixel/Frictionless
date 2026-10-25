// Dumps the live rubric, brand presets and sample-batch examples to docs/_data.json for the criteria PDF.
// Regenerate: npx tsx scripts/dump-doc-data.ts && python3 docs/build_pdf_html.py && node docs/render_pdf.cjs
import { readFileSync, writeFileSync } from "node:fs";
import { parseWorkbook } from "../src/lib/engine/parse";
import { runEngine } from "../src/lib/engine/run";
import { buildProfile, INDUSTRIES, MODELS } from "../src/lib/engine/brand";
import { DEFAULT_RUBRIC } from "../src/lib/engine/rubric";
import { metrics, dimensionsWithMetrics, gates, bands, DIM_BLURB } from "../src/lib/criteria";
import { applyEdits } from "../src/lib/engine/patch";
import { buildPlan } from "../src/lib/engine/plan";
const brand = buildProfile("eyewear", "fofo");
const buf = readFileSync("public/sample/Frictionless_Sample_Batch.xlsx");
const wb = parseWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const input = { applications: wb.applications, territories: wb.territories, stores: wb.stores, brand, rubric: DEFAULT_RUBRIC, tags: {}, localities: {}, overrides: {} };
const out = runEngine(input);
const after = applyEdits(wb.applications, wb.territories, [{ entity: "application", id: "APP-012", field: "space", value: "Rented" }, { entity: "application", id: "APP-012", field: "floor", value: "Ground" }, { entity: "application", id: "APP-012", field: "size", value: 450 }]);
const out2 = runEngine({ ...input, applications: after.applications, edited: { "APP-012": ["space", "floor", "size"] } });
const pick = (o: typeof out, id: string) => { const r = o.results.find((x) => x.id === id)!; return { id: r.id, name: r.app.name, decision: r.decision, score: r.score, P: r.partnerScore, L: r.locationScore, headline: r.headline, conditions: r.conditions.map((c) => c.text), dims: r.dimensions.map((d) => [d.label, d.score]), factors: r.factors.map((f) => [f.label, f.weight, f.score, f.evidence]), paths: r.paths, ter: r.territoryId, tier: r.tier }; };
const withdraw = applyEdits(wb.applications, wb.territories, [{ entity: "application", id: "APP-019", field: "withdrawn", value: true }]);
const out3 = runEngine({ ...input, applications: withdraw.applications });
const d3 = out3.results.filter((r) => out.results.find((x) => x.id === r.id)!.decision !== r.decision).map((r) => [r.id, out.results.find((x) => x.id === r.id)!.decision, r.decision, r.headline]);
const plan = buildPlan(out.results.find((x) => x.id === "APP-016")!, brand, new Date("2026-10-25"));
writeFileSync("docs/_data.json", JSON.stringify({
  rubric: DEFAULT_RUBRIC, brand, metrics: metrics(DEFAULT_RUBRIC, brand), dims: dimensionsWithMetrics(DEFAULT_RUBRIC, brand), blurb: DIM_BLURB, gates: gates(DEFAULT_RUBRIC), bands: bands(DEFAULT_RUBRIC),
  industries: INDUSTRIES.map((i) => ({ label: i.label, capex: i.base.capexLakh, sqft: i.base.sqft, footfall: i.base.footfall, ground: i.base.groundCritical, staff: i.base.staff, lead: i.base.leadMonths, rev: i.base.revenueLakhPerMonth, margin: i.base.marginPct })),
  models: MODELS, summary: out.summary,
  territories: out.territories.map((t) => ({ id: t.id, city: t.territory.city, pins: t.territory.pins, cap: t.capacity, slots: t.territory.slots, prio: t.territory.priority, alloc: t.allocated, wait: t.waitlist, note: t.note })),
  all: out.results.map((r) => [r.id, r.app.name, r.decision, r.score, r.headline]),
  before: pick(out, "APP-012"), after: pick(out2, "APP-012"), reloc: pick(out, "APP-001"), withdraw: d3,
  plan: plan.steps.map((s) => [s.phase, s.date, s.title, s.owner]), planNote: plan.note, planFor: "APP-016",
}, null, 1));
console.log("ok", out.summary, pick(out2, "APP-012").decision, pick(out2, "APP-012").score);
