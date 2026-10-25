import * as XLSX from "xlsx";
import type { Application, Issue, Store, Territory } from "./types";
import * as N from "./normalize";
import { EXISTING_STORES, findCity } from "./reference";

// Reads the judges' workbook as-is. Sheets are recognised by their headers,
// not their names, and the header row may sit below a title row.

type Row = Record<string, unknown>;
type Kind = "applications" | "territories" | "stores";

const APP_COLS: Record<string, RegExp> = {
  id: /^(application|app)(id|no|number|ref)?$|applicationid/,
  name: /applicantname|^name$|fullname/,
  cityStatePin: /city.*state.*pin|city.*pin/,
  city: /^city$|^location$/,
  state: /^state$/,
  pin: /^pin|pincode|postal|zip/,
  investment: /invest|capital|budget/,
  experience: /experience|yearsinretail/,
  business: /business|occupation|currentpast/,
  space: /spaceavail|spacestatus|^space$|haveaspace/,
  size: /size|sqft|area/,
  floor: /floor/,
  launch: /launch|timeline|months/,
  language: /language/,
  notes: /note|comment|remark/,
};

const TER_COLS: Record<string, RegExp> = {
  id: /territoryid|^territory$|^terid/,
  cityState: /city.*state/,
  city: /^city$/,
  state: /^state$/,
  pins: /pin/,
  tier: /tier/,
  slots: /slot|capacity|stores?wanted/,
  priority: /priority/,
};

const STORE_COLS: Record<string, RegExp> = {
  id: /storeid|^store$/,
  city: /^city$/,
  pin: /pin/,
  opened: /open|year/,
};

const key = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

function mapHeaders(headers: unknown[], spec: Record<string, RegExp>): Record<string, number> {
  const out: Record<string, number> = {};
  headers.forEach((h, i) => {
    const k = key(h);
    if (!k) return;
    for (const [field, re] of Object.entries(spec)) {
      if (out[field] !== undefined) continue;
      // "City · State · Pin code" must not also be read as plain city or pin.
      if ((field === "city" || field === "pin" || field === "state") && /city.*(state|pin)/.test(k)) continue;
      if (field === "size" && /investment/.test(k)) continue;
      if (re.test(k)) {
        out[field] = i;
        break;
      }
    }
  });
  return out;
}

function findTable(rows: unknown[][]): { kind: Kind; headerRow: number; cols: Record<string, number> } | null {
  let best: { kind: Kind; headerRow: number; cols: Record<string, number>; hits: number } | null = null;
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = rows[r] ?? [];
    const cands: [Kind, Record<string, RegExp>, string][] = [
      ["applications", APP_COLS, "id"],
      ["territories", TER_COLS, "id"],
      ["stores", STORE_COLS, "id"],
    ];
    for (const [kind, spec] of cands) {
      const cols = mapHeaders(row, spec);
      let hits = Object.keys(cols).length;
      const joined = row.map(key).join("|");
      if (kind === "applications" && !/applica|invest/.test(joined)) hits = 0;
      if (kind === "territories" && !/territor|slot/.test(joined)) hits = 0;
      if (kind === "stores" && !/store/.test(joined)) hits = 0;
      if (hits >= 3 && (!best || hits > best.hits)) best = { kind, headerRow: r, cols, hits };
    }
  }
  return best;
}

export interface ParsedWorkbook {
  applications: Application[];
  territories: Territory[];
  stores: Store[];
  storesSource: "workbook" | "built-in";
  sheets: { name: string; kind: Kind | "ignored"; rows: number }[];
  issues: Issue[];
}

export function parseWorkbook(data: ArrayBuffer): ParsedWorkbook {
  const wb = XLSX.read(data, { type: "array", cellStyles: true });
  const issues: Issue[] = [];
  const sheets: ParsedWorkbook["sheets"] = [];
  let applications: Application[] = [];
  let territories: Territory[] = [];
  let stores: Store[] = [];

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: false, raw: true });
    const t = findTable(rows);
    if (!t) {
      sheets.push({ name, kind: "ignored", rows: rows.length });
      continue;
    }
    let body = rows.slice(t.headerRow + 1).filter((r) => r && r.some((c) => c !== null && String(c).trim() !== ""));
    // The official template puts a grey example row right under the headers
    // ("Row 3 is an example (grey); enter data from row 4"). It is not data.
    if (t.kind !== "stores" && body.length && isExampleRow(ws, rows, t.headerRow) && matchesTemplateExample(t.kind, t.cols, body)) {
      body = body.slice(1);
      issues.push({ severity: "info", code: "example-row", message: `${name}: skipped the template's example row (row ${t.headerRow + 2}).` });
    }
    const headers = rows[t.headerRow] ?? [];
    const toObj = (r: unknown[]) => {
      const o: Row = {};
      for (const [f, i] of Object.entries(t.cols)) o[f] = r[i];
      const raw: Row = {};
      headers.forEach((h, i) => h && (raw[String(h)] = r[i]));
      o.__raw = raw;
      return o;
    };
    sheets.push({ name, kind: t.kind, rows: body.length });
    if (t.kind === "applications" && !applications.length) applications = body.map((r, i) => readApplication(toObj(r), t.headerRow + i + 2));
    if (t.kind === "territories" && !territories.length) territories = body.map((r, i) => readTerritory(toObj(r), t.headerRow + i + 2));
    if (t.kind === "stores" && !stores.length) stores = body.map((r) => readStore(toObj(r))).filter((s): s is Store => !!s);
  }

  if (!applications.length) issues.push({ severity: "block", code: "no-applications", message: "No Applications sheet found (looked for a header row with 'Application ID')." });
  if (!territories.length) issues.push({ severity: "warn", code: "no-territories", message: "No Territories sheet found — every application will be treated as outside the expansion plan." });
  let storesSource: ParsedWorkbook["storesSource"] = "workbook";
  if (!stores.length) {
    stores = EXISTING_STORES;
    storesSource = "built-in";
  }
  return { applications, territories, stores, storesSource, sheets, issues };
}

/** The row under the headers is the template's example: the title says so, or it is shaded and the next row is not. */
function isExampleRow(ws: XLSX.WorkSheet, rows: unknown[][], headerRow: number): boolean {
  const above = rows.slice(0, headerRow).flat().map((c) => String(c ?? "")).join(" ");
  if (/\bexample\b/i.test(above) && /enter data|row \d+ is an example/i.test(above)) return true;
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  const shaded = (r: number) => {
    const s = (ws[XLSX.utils.encode_cell({ r, c: range.s.c })] as { s?: { patternType?: string; fgColor?: { rgb?: string } } } | undefined)?.s;
    return s?.patternType === "solid" && !!s.fgColor?.rgb && !/^(FF)?FFFFFF$/i.test(s.fgColor.rgb);
  };
  // sheet_to_json skips blank rows, so map back through the sheet's own row numbers.
  const first = range.s.r + headerRow + 1;
  return shaded(first) && !shaded(first + 1);
}

/**
 * Row 3 still holds the template's own example (Ravi Kumar / TER-01 Mysuru 570001, 570002, 570008).
 * If the judges typed a real application over it, the note and the shading stay but the content changes,
 * so the row is kept. It is dropped only when its ID is used again below (real data also starts at
 * APP-001 / TER-01) or every value is still the template's.
 */
function matchesTemplateExample(kind: Kind, cols: Record<string, number>, body: unknown[][]): boolean {
  const cell = (row: unknown[], f: string) => (cols[f] === undefined ? "" : String(row[cols[f]] ?? "").toLowerCase().replace(/\s+/g, " ").trim());
  const [row, ...rest] = body;
  const id = N.normId(cell(row, "id"));
  const repeated = rest.some((r) => N.normId(cell(r, "id")) === id);
  const pinsOf = (r: unknown[], f: string) => (cell(r, f).match(/\d{6}/g) ?? []).sort().join(",");
  if (kind === "applications") {
    if (id !== "APP-001" || cell(row, "name") !== "ravi kumar") return false;
    const pin = pinsOf(row, cols.pin !== undefined ? "pin" : "cityStatePin");
    return repeated || (pin === "570001" && cell(row, "investment") === "25" && cell(row, "experience") === "4" && /before diwali/.test(cell(row, "notes")));
  }
  if (id !== "TER-01" || pinsOf(row, "pins") !== "570001,570002,570008") return false;
  return repeated || (cell(row, "slots") === "3" && cell(row, "priority") === "high");
}

function splitCityStatePin(v: unknown): { city: string; state: string; pin: string } {
  const s = N.text(v);
  const parts = s.split(/\s*[·•|,]\s*|\s+-\s+/).filter(Boolean);
  const pin = parts.find((p) => /\d{6}/.test(p))?.match(/\d{6}/)?.[0] ?? "";
  const words = parts.filter((p) => !/\d{6}/.test(p));
  return { city: words[0] ?? "", state: words[1] ?? "", pin };
}

export function readApplication(o: Row, row: number): Application {
  const issues: Issue[] = [];
  const take = <T,>(n: N.Norm<T>) => {
    if (n.issue) issues.push(n.issue);
    return n.value;
  };
  let city = N.text(o.city);
  let state = N.text(o.state);
  let pinRaw = o.pin;
  if (o.cityStatePin !== undefined && (!city || pinRaw === undefined)) {
    const s = splitCityStatePin(o.cityStatePin);
    city ||= s.city;
    state ||= s.state;
    pinRaw ??= s.pin;
  }
  if ((pinRaw === undefined || pinRaw === null || String(pinRaw).trim() === "") && /\d{3}\s?\d{3}/.test(city)) {
    pinRaw = city.match(/\d{3}\s?\d{3}/)![0];
    city = city.replace(/[\s,·-]*\d{3}\s?\d{3}.*/, "").trim();
  }
  const canon = findCity(city);
  if (canon && canon.name !== city) city = canon.name;
  const id = N.normId(o.id) || N.normId(`ROW-${row}`);
  if (!N.text(o.id)) issues.push({ severity: "warn", field: "id", code: "missing-id", message: `No Application ID — labelled ${id}.` });
  const size = N.count(o.size, "size", "Space size", { max: 20000 });
  return {
    id,
    name: N.personName(o.name),
    city,
    state,
    pin: take(N.pin(pinRaw)) ?? "",
    investment: take(N.investment(o.investment)),
    experience: take(N.count(o.experience, "experience", "Retail experience", { max: 50 })),
    business: N.text(o.business),
    space: take(N.space(o.space)),
    size: take(size),
    floor: take(N.floor(o.floor)),
    launch: take(N.launch(o.launch)),
    language: take(N.language(o.language)),
    notes: N.text(o.notes),
    row,
    raw: o.__raw as Record<string, unknown>,
    parseIssues: issues,
  };
}

export function readTerritory(o: Row, row: number): Territory {
  const issues: Issue[] = [];
  let city = N.text(o.city);
  let state = N.text(o.state);
  if (o.cityState !== undefined && !city) {
    const parts = N.text(o.cityState).split(/\s*[·•|,]\s*/);
    city = parts[0] ?? "";
    state = parts[1] ?? "";
  }
  const canonT = findCity(city);
  if (canonT && canonT.name !== city) city = canonT.name;
  const { pins, bad } = N.pinList(o.pins);
  if (bad.length) issues.push({ severity: "warn", field: "pins", code: "bad-pins", message: `Ignored entries that are not 6-digit pins: ${bad.join(", ")}.` });
  if (!pins.length) issues.push({ severity: "warn", field: "pins", code: "no-pins", message: "No pin codes listed — no application can match this territory." });
  const slots = N.count(o.slots, "slots", "Open slots", { max: 100 });
  if (slots.issue) issues.push(slots.issue);
  const tier = N.tier(o.tier);
  if (!tier && N.text(o.tier)) issues.push({ severity: "warn", field: "tier", code: "bad-tier", message: `Tier "${N.text(o.tier)}" not recognised.` });
  const pr = N.priority(o.priority);
  if (!pr) issues.push({ severity: "warn", field: "priority", code: "bad-priority", message: `Priority "${N.text(o.priority)}" not recognised — treated as Medium.` });
  return {
    id: N.normId(o.id) || `TER-ROW${row}`,
    city,
    state,
    pins,
    tier,
    slots: slots.value === null ? null : Math.floor(slots.value),
    priority: pr,
    row,
    parseIssues: issues,
  };
}

function readStore(o: Row): Store | null {
  const p = N.pin(o.pin).value;
  if (!p) return null;
  const y = N.count(o.opened, "opened", "Opened", { max: 3000 }).value;
  return { id: N.normId(o.id) || `ST-${p}`, city: N.text(o.city), pin: p, opened: y };
}
