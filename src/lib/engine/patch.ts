import type { Application, Decision, EngineOutput, Issue, Territory } from "./types";
import * as N from "./normalize";
import { pinList } from "./normalize";

// Changes are stored as an append-only list of edits on top of the uploaded
// sheets. The current dataset is always base + edits, so every change can be
// audited, previewed and undone.

export type Entity = "application" | "territory";

export interface Edit {
  entity: Entity;
  id: string;
  field: string;
  value: unknown;
}

export interface ChangeEntry {
  id: string;
  at: string;
  source: "chat" | "form" | "override" | "rubric" | "brand";
  message: string;
  edits: Edit[];
  impact: DiffRow[];
}

export const APP_FIELDS: Record<string, string> = {
  name: "Applicant name",
  city: "City",
  pin: "Pin code",
  investment: "Investment capacity (₹ lakh)",
  experience: "Retail experience (years)",
  business: "Current / past business",
  space: "Space available",
  size: "Space size (sq ft)",
  floor: "Floor",
  launch: "Target launch (months)",
  language: "Preferred language",
  notes: "Notes from applicant",
  withdrawn: "Withdrawn",
};

export const TER_FIELDS: Record<string, string> = {
  slots: "Open slots",
  priority: "Priority",
  pins: "Pin codes covered",
  tier: "City tier",
};

function normApp(field: string, v: unknown): { value: unknown; issue?: Issue; error?: string } {
  switch (field) {
    case "investment": {
      const n = N.investment(v);
      return n.value === null ? { value: null, error: n.issue?.message } : { value: n.value, issue: n.issue };
    }
    case "experience":
    case "size": {
      const n = N.count(v, field, APP_FIELDS[field], { max: field === "size" ? 20000 : 50 });
      return { value: n.value, issue: n.issue };
    }
    case "launch":
      return { value: N.launch(v).value };
    case "pin": {
      const n = N.pin(v);
      return n.value ? { value: n.value } : { value: null, error: n.issue?.message };
    }
    case "space": {
      const n = N.space(v);
      return n.value ? { value: n.value } : { value: null, error: n.issue?.message };
    }
    case "floor":
      return { value: N.floor(v).value };
    case "language":
      return { value: N.language(v).value };
    case "withdrawn":
      return { value: v === true || /^(true|yes|1|withdrawn)$/i.test(String(v)) };
    case "name":
    case "city":
    case "business":
    case "notes":
      return { value: N.text(v) };
    default:
      return { value: null, error: `Unknown field "${field}".` };
  }
}

export function validateEdit(e: Edit, apps: Application[], ters: Territory[]): string | null {
  if (e.entity === "application") {
    if (e.field === "*") return null;
    if (!apps.some((a) => a.id === e.id)) return `No application ${e.id}.`;
    if (!(e.field in APP_FIELDS)) return `Unknown application field "${e.field}".`;
    return normApp(e.field, e.value).error ?? null;
  }
  if (!ters.some((t) => t.id === e.id)) return `No territory ${e.id}.`;
  if (!(e.field in TER_FIELDS)) return `Unknown territory field "${e.field}".`;
  if (e.field === "slots" && N.count(e.value, "slots", "Open slots", { max: 100 }).value === null) return "Open slots must be a number.";
  if (e.field === "priority" && !N.priority(e.value)) return "Priority must be High, Medium or Low.";
  if (e.field === "tier" && !N.tier(e.value)) return "Tier must be Tier 1, 2 or 3.";
  if (e.field === "pins" && !pinList(e.value).pins.length) return "Give at least one 6-digit pin code.";
  return null;
}

export function applyEdits(apps: Application[], ters: Territory[], edits: Edit[]): { applications: Application[]; territories: Territory[] } {
  let A = apps.map((a) => ({ ...a }));
  let T = ters.map((t) => ({ ...t }));
  for (const e of edits) {
    if (e.entity === "application") {
      if (e.field === "*") {
        // A new application typed into the app.
        const v = (e.value ?? {}) as Record<string, unknown>;
        if (A.some((a) => a.id === e.id)) continue;
        const base: Application = { id: e.id, name: "", city: "", state: "Karnataka", pin: "", investment: null, experience: null, business: "", space: null, size: null, floor: "Not known", launch: null, language: null, notes: "", row: 0, parseIssues: [] };
        for (const [k, val] of Object.entries(v)) {
          const n = normApp(k, val);
          if (!n.error) (base as unknown as Record<string, unknown>)[k] = n.value;
        }
        A = [...A, base];
        continue;
      }
      A = A.map((a) => {
        if (a.id !== e.id) return a;
        const n = normApp(e.field, e.value);
        if (n.error) return a;
        const parseIssues = a.parseIssues.filter((i) => i.field !== e.field);
        if (n.issue && n.issue.severity !== "info") parseIssues.push(n.issue);
        return { ...a, [e.field]: n.value, parseIssues };
      });
    } else {
      T = T.map((t) => {
        if (t.id !== e.id) return t;
        const parseIssues = t.parseIssues.filter((i) => i.field !== e.field);
        if (e.field === "slots") return { ...t, slots: N.count(e.value, "slots", "Open slots", { max: 100 }).value ?? t.slots, parseIssues };
        if (e.field === "priority") return { ...t, priority: N.priority(e.value) ?? t.priority, parseIssues };
        if (e.field === "tier") return { ...t, tier: N.tier(e.value) ?? t.tier, parseIssues };
        if (e.field === "pins") return { ...t, pins: pinList(e.value).pins, parseIssues };
        return t;
      });
    }
  }
  return { applications: A, territories: T };
}

export interface DiffRow {
  id: string;
  name: string;
  from: Decision | null;
  to: Decision | null;
  scoreFrom: number | null;
  scoreTo: number | null;
  why: string;
  direct: boolean; // the change was made to this application
}

export function diffOutputs(before: EngineOutput, after: EngineOutput, touched: string[] = []): DiffRow[] {
  const b = new Map(before.results.map((r) => [r.id, r]));
  const rows: DiffRow[] = [];
  for (const r of after.results) {
    const o = b.get(r.id);
    const changedDecision = !o || o.decision !== r.decision;
    const changedScore = !o || Math.abs(o.score - r.score) >= 0.1;
    const changedSlot = o && (o.slot !== r.slot || o.territoryId !== r.territoryId || o.app.pin !== r.app.pin);
    if (changedDecision || changedSlot || (changedScore && touched.includes(r.id)))
      rows.push({ id: r.id, name: r.app.name, from: o?.decision ?? null, to: r.decision, scoreFrom: o?.score ?? null, scoreTo: r.score, why: r.headline, direct: touched.includes(r.id) });
  }
  for (const o of before.results) if (!after.results.some((r) => r.id === o.id)) rows.push({ id: o.id, name: o.app.name, from: o.decision, to: null, scoreFrom: o.score, scoreTo: null, why: "Removed", direct: true });
  return rows.sort((x, y) => Number(y.direct) - Number(x.direct) || x.id.localeCompare(y.id));
}

export function describeEdit(e: Edit, apps: Application[], ters: Territory[]): string {
  if (e.entity === "application") {
    if (e.field === "*") return `Added application ${e.id}`;
    const a = apps.find((x) => x.id === e.id);
    const before = a ? (a as unknown as Record<string, unknown>)[e.field] : undefined;
    return `${e.id} · ${APP_FIELDS[e.field] ?? e.field}: ${fmt(before)} → ${fmt(e.value)}`;
  }
  const t = ters.find((x) => x.id === e.id);
  const before = t ? (t as unknown as Record<string, unknown>)[e.field] : undefined;
  return `${e.id} · ${TER_FIELDS[e.field] ?? e.field}: ${fmt(before)} → ${fmt(e.value)}`;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "blank";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}
