import { readFileSync } from "node:fs";
import { parseWorkbook } from "../src/lib/engine/parse";
import { runEngine } from "../src/lib/engine/run";
import { buildProfile } from "../src/lib/engine/brand";
import { DEFAULT_RUBRIC } from "../src/lib/engine/rubric";

const buf = readFileSync(process.argv[2] ?? "public/sample/Outpost_Sample_Batch.xlsx");
const wb = parseWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
console.log("sheets", wb.sheets, "stores", wb.storesSource, wb.issues);
const brand = buildProfile(process.argv[3] ?? "eyewear", process.argv[4] ?? "fofo");
const t0 = Date.now();
const out = runEngine({ applications: wb.applications, territories: wb.territories, stores: wb.stores, brand, rubric: DEFAULT_RUBRIC, tags: {}, localities: {}, overrides: {} });
console.log("ms", Date.now() - t0, out.summary, out.batchIssues.map((i) => i.message));
for (const r of out.results) {
  console.log(`\n${r.id.padEnd(8)} ${r.decision.padEnd(11)} ${String(r.score).padStart(5)} (P${r.partnerScore}/L${r.locationScore}) ${r.territoryId ?? "-"} ${r.slot}  ${r.headline}`);
  for (const c of r.conditions) console.log("    cond:", c.text);
  for (const i of r.issues.filter((i) => i.severity !== "info")) console.log("    issue:", i.severity, i.message);
  for (const p of r.paths) console.log("    path:", p.label, "->", p.becomes, p.score);
  if (r.alternatives.length) console.log("    alt:", r.alternatives.map((a) => `${a.pin} ${a.territory} ${a.km}km`).join("; "));
}
for (const t of out.territories) console.log(t.id, "cap", t.capacity, "alloc", t.allocated, "wait", t.waitlist, t.note, t.issues.map((i) => i.message));
console.log(out.latentDemand);
