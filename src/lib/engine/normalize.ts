import type { Floor, Issue, Language, Priority, SpaceStatus, Tier } from "./types";

// Every cell from the sheet (or from a chat/form edit) passes through these.
// They accept messy input, return a clean value, and say what they assumed.

export interface Norm<T> {
  value: T | null;
  issue?: Issue;
}

const WORD_NUM: Record<string, number> = { zero: 0, nil: 0, none: 0, no: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50 };
const WORD_RE = new RegExp(`\\b(${Object.keys(WORD_NUM).join("|")})\\b`);

const BLANKS = new Set(["", "-", "--", "—", "–", ".", "na", "n/a", "n.a.", "nil", "null", "none", "tbd", "tba", "?", "??", "nan", "undefined", "not applicable", "#n/a", "x", "xx", "xxx"]);

function blank(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  return BLANKS.has(String(v).replace(/\s+/g, " ").trim().toLowerCase());
}

export function text(v: unknown): string {
  return blank(v) ? "" : String(v).replace(/[​ ]/g, " ").replace(/\s+/g, " ").trim();
}

/** "  ravi   KUMAR " -> "Ravi Kumar"; placeholder names become blank. */
export function personName(v: unknown): string {
  const t = text(v).replace(/^(mr|mrs|ms|dr|shri|smt)\.?\s+/i, (m) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase());
  if (!t || /^(test|name|applicant|unknown|abc|xyz|asdf)$/i.test(t)) return "";
  const allCaps = t === t.toUpperCase();
  const allLower = t === t.toLowerCase();
  if (!allCaps && !allLower) return t;
  return t.toLowerCase().replace(/(^|[\s.'-])([a-z])/g, (_, p, c) => p + c.toUpperCase());
}

/** "app 7", "App-007 ", "APP_07" -> "APP-007"; "ter1" -> "TER-01". Shared by the sheet and the chat. */
export function normId(v: unknown): string {
  const t = text(v).toUpperCase().replace(/\s+/g, " ");
  const m = t.match(/^([A-Z]{2,5})\s*[-_ ]?\s*0*(\d{1,5})(#\d+)?$/);
  if (!m) return t;
  const pad = m[1] === "TER" || m[1] === "ST" ? 2 : 3;
  return `${m[1]}-${m[2].padStart(pad, "0")}${m[3] ?? ""}`;
}

function firstNumber(s: string): number | null {
  const m = s.replace(/(\d),(\d)/g, "$1$2").match(/-?\d+(\.\d+)?/);
  if (m) return parseFloat(m[0]);
  const w = s.toLowerCase().match(WORD_RE);
  return w ? WORD_NUM[w[1]] : null;
}

export function investment(v: unknown, field = "investment"): Norm<number> {
  if (blank(v)) return { value: null, issue: { severity: "block", field, code: "missing-investment", message: "Investment amount missing." } };
  const raw = String(v);
  const s = raw.toLowerCase();
  const n = typeof v === "number" ? v : firstNumber(s);
  if (n === null) return { value: null, issue: { severity: "block", field, code: "bad-investment", message: `Investment "${raw}" is not an amount.` } };
  if (n <= 0) return { value: null, issue: { severity: "block", field, code: "zero-investment", message: `Investment is ${n} — amount missing.` } };
  if (typeof v !== "number") {
    if (/crore|\bcr\b/.test(s)) return { value: n * 100, issue: { severity: "info", field, code: "crore", message: `Read "${raw}" as ₹${n * 100} lakh.` } };
    if (/million|\bmn\b/.test(s)) return { value: n * 10, issue: { severity: "info", field, code: "million", message: `Read "${raw}" as ₹${n * 10} lakh.` } };
    if (/\bk\b|thousand/.test(s)) return { value: +(n / 100).toFixed(2), issue: { severity: "warn", field, code: "thousand", message: `Read "${raw}" as ₹${(n / 100).toFixed(2)} lakh.` } };
  }
  if (n >= 10000) return { value: +(n / 100000).toFixed(2), issue: { severity: "warn", field, code: "rupees-not-lakh", message: `${raw} looks like rupees, not lakh — read as ₹${(n / 100000).toFixed(1)} lakh.` } };
  if (typeof v !== "number") {
    const range = s.replace(/(\d),(\d)/g, "$1$2").match(/(\d+(?:\.\d+)?)\s*(?:-|to|–)\s*(\d+(?:\.\d+)?)/);
    if (range) return { value: parseFloat(range[1]), issue: { severity: "info", field, code: "range", message: `Investment given as a range ("${raw}"); used the lower end, ₹${range[1]} lakh.` } };
    if (/approx|around|about|~|upto|up to|max/.test(s)) return { value: n, issue: { severity: "info", field, code: "approx", message: `Investment "${raw}" read as ₹${n} lakh.` } };
  }
  return { value: n };
}

export function count(v: unknown, field: string, label: string, opts: { max: number; blankIs?: number }): Norm<number> {
  if (blank(v)) {
    if (opts.blankIs !== undefined) return { value: opts.blankIs, issue: { severity: "info", field, code: `blank-${field}`, message: `${label} is blank — treated as ${opts.blankIs}.` } };
    return { value: null };
  }
  const s = String(v).toLowerCase();
  let n = typeof v === "number" ? v : firstNumber(s);
  if (n === null && /fresher|no experience|first time|never/.test(s)) n = 0;
  if (n === null) return { value: null, issue: { severity: "warn", field, code: `bad-${field}`, message: `${label} "${String(v)}" is not a number.` } };
  if (typeof v !== "number" && field === "experience" && /month/.test(s) && !/year/.test(s)) {
    const y = +(n / 12).toFixed(1);
    return { value: y, issue: { severity: "info", field, code: "months", message: `Experience "${String(v)}" read as ${y} years.` } };
  }
  if (n < 0) return { value: 0, issue: { severity: "warn", field, code: `neg-${field}`, message: `${label} is negative (${n}) — treated as 0.` } };
  if (n > opts.max) return { value: n, issue: { severity: "warn", field, code: `implausible-${field}`, message: `${label} of ${n} looks implausible — please confirm.` } };
  return { value: n };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function launch(v: unknown, today = new Date()): Norm<number> {
  if (blank(v)) return { value: null };
  if (typeof v !== "number") {
    const raw = String(v);
    const s = raw.toLowerCase();
    const num = firstNumber(s);
    if (/asap|immediate|right away|\bnow\b|urgent/.test(s) && num === null) return { value: 1, issue: { severity: "info", field: "launch", code: "asap", message: `Launch "${raw}" read as 1 month.` } };
    if (/diwali|deepavali/.test(s)) {
      const d = new Date("2026-11-08");
      const m = Math.max(1, Math.round((d.getTime() - today.getTime()) / (30.4 * 864e5)));
      return { value: m, issue: { severity: "info", field: "launch", code: "festival", message: `Launch "${raw}" read as ${m} month${m === 1 ? "" : "s"} (Diwali, 8 Nov 2026).` } };
    }
    const mi = MONTHS.findIndex((m) => new RegExp(`\\b${m}`).test(s));
    if (mi >= 0 && !/months?\b/.test(s)) {
      const yr = s.match(/20\d\d/)?.[0];
      let year = yr ? +yr : today.getFullYear();
      if (!yr && mi < today.getMonth()) year++;
      const m = Math.max(1, (year - today.getFullYear()) * 12 + mi - today.getMonth());
      return { value: m, issue: { severity: "info", field: "launch", code: "month-name", message: `Launch "${raw}" read as ${m} month${m === 1 ? "" : "s"} from now.` } };
    }
    if (/year/.test(s) && !/month/.test(s)) {
      const n = num ?? 1;
      return { value: n * 12, issue: { severity: "info", field: "launch", code: "years", message: `Launch "${raw}" read as ${n * 12} months.` } };
    }
    if (/week|days?\b/.test(s)) return { value: 1, issue: { severity: "info", field: "launch", code: "weeks", message: `Launch "${raw}" read as 1 month.` } };
  }
  const r = count(v, "launch", "Target launch", { max: 36 });
  if (r.value === 0) return { value: 1, issue: { severity: "warn", field: "launch", code: "zero-launch", message: "Target launch is 0 months — read as 'as soon as possible' (1 month)." } };
  return r;
}

export function pin(v: unknown): Norm<string> {
  if (blank(v)) return { value: null, issue: { severity: "block", field: "pin", code: "missing-pin", message: "Pin code is blank — location cannot be checked." } };
  const all = String(v).replace(/\.0+$/, "");
  const six = all.replace(/(\d{3})\s+(\d{3})/g, "$1$2").match(/\b\d{6}\b/);
  if (six) return { value: six[0] };
  const digits = all.replace(/\D/g, "");
  if (digits.length !== 6) return { value: null, issue: { severity: "block", field: "pin", code: "bad-pin", message: `Pin code "${String(v)}" is not 6 digits.` } };
  return { value: digits };
}

export function space(v: unknown): Norm<SpaceStatus> {
  if (blank(v)) return { value: null, issue: { severity: "block", field: "space", code: "missing-space", message: "Space available is blank." } };
  const raw = String(v);
  const s = raw.toLowerCase();
  const pos = (re: RegExp) => s.search(re);
  const own = /not own/.test(s) ? -1 : pos(/\bown(ed|s)?\b|self[- ]owned|family (property|building|shop)|ancestral|bought/);
  const rent = pos(/\brent(ed|al)?\b|\blease(d)?\b|\btenan|on hire/);
  const none = pos(/not yet|not identified|no space|no shop|looking|searching|yet to|to be (decided|found|identified)|not available|^no$|finding|will (find|rent|buy)/);
  const hits = [
    ["Owned", own],
    ["Rented", rent],
    ["Not yet identified", none],
  ].filter(([, i]) => (i as number) >= 0) as [SpaceStatus, number][];
  if (hits.length) {
    hits.sort((a, b) => a[1] - b[1]);
    const value = none >= 0 && /will (rent|buy)|plan to/.test(s) ? "Not yet identified" : hits[0][0];
    return hits.length > 1 || raw.trim().toLowerCase() !== value.toLowerCase() ? { value, issue: { severity: "info", field: "space", code: "space-read", message: `Space "${raw}" read as ${value}.` } } : { value };
  }
  if (/^(yes|y|available|have)\b/.test(s.trim())) return { value: null, issue: { severity: "block", field: "space", code: "space-yes", message: `Space says "${raw}" — owned or rented?` } };
  return { value: null, issue: { severity: "block", field: "space", code: "bad-space", message: `Space available "${raw}" is not Owned / Rented / Not yet identified.` } };
}

export function floor(v: unknown): Norm<Floor> {
  if (blank(v)) return { value: "Not known", issue: { severity: "info", field: "floor", code: "blank-floor", message: "Floor is blank — treated as Not known." } };
  const raw = String(v);
  const s = raw.toLowerCase().trim();
  if (/mall|shopping (centre|center)|food court/.test(s)) return { value: "Mall unit" };
  if (/basement|lower ground|cellar/.test(s)) return { value: "Upper", issue: { severity: "info", field: "floor", code: "basement", message: `"${raw}" — basement treated like an upper floor (low visibility).` } };
  if (/ground|^g\.?f\.?$|^g$|^gnd|street|road[- ]facing|^0$/.test(s)) return { value: "Ground" };
  if (/upper|first|1st|^ff$|second|2nd|third|3rd|top|terrace|mezzanine|^[1-9]$|floor [1-9]/.test(s)) return { value: "Upper" };
  if (/not|unknown|know|unsure|tbd|depends/.test(s)) return { value: "Not known" };
  return { value: "Not known", issue: { severity: "warn", field: "floor", code: "bad-floor", message: `Floor "${raw}" not recognised — treated as Not known.` } };
}

export function language(v: unknown): Norm<Language> {
  if (blank(v)) return { value: null, issue: { severity: "info", field: "language", code: "blank-language", message: "Preferred language is blank — training defaults to English." } };
  const raw = String(v);
  const s = raw.toLowerCase();
  const found: [Language, number][] = (
    [
      ["Kannada", s.search(/kann|\bkan\b|^kn$|ಕನ್ನಡ/)],
      ["Hindi", s.search(/hind|^hi$|हिं?न्?दी|हिंदी/)],
      ["English", s.search(/eng|^en$/)],
    ] as [Language, number][]
  ).filter(([, i]) => i >= 0);
  if (found.length) {
    found.sort((a, b) => a[1] - b[1]);
    return found.length > 1 ? { value: found[0][0], issue: { severity: "info", field: "language", code: "multi-language", message: `Languages "${raw}" — training in ${found[0][0]} (first listed).` } } : { value: found[0][0] };
  }
  return { value: null, issue: { severity: "warn", field: "language", code: "bad-language", message: `Language "${raw}" is not Kannada / English / Hindi — training defaults to English.` } };
}

export function tier(v: unknown): Tier | null {
  if (blank(v)) return null;
  const s = String(v).toLowerCase();
  if (/\biii\b|three|\b3\b|-3|t3/.test(s)) return "Tier 3";
  if (/\bii\b|two|\b2\b|-2|t2/.test(s)) return "Tier 2";
  if (/\bi\b|one|\b1\b|-1|t1|metro/.test(s)) return "Tier 1";
  return null;
}

export function priority(v: unknown): Priority | null {
  if (blank(v)) return null;
  const s = String(v).toLowerCase().trim();
  if (/high|^h$|top|urgent|critical|^p1$|^1$|first/.test(s)) return "High";
  if (/med|^m$|mid|normal|average|^p2$|^2$/.test(s)) return "Medium";
  if (/low|^l$|later|^p3$|^3$|minor/.test(s)) return "Low";
  return null;
}

/** "570001, 570002 & 570008", "570 001 / 570002", "570001-05" -> unique 6-digit pins. */
export function pinList(v: unknown): { pins: string[]; bad: string[] } {
  if (blank(v)) return { pins: [], bad: [] };
  const raw = String(v)
    .replace(/(\d{3})\s(\d{3})(?!\d)/g, "$1$2")
    .replace(/\b(and|&|pins?|pin codes?|codes?)\b|&/gi, ",");
  const pins: string[] = [];
  const bad: string[] = [];
  for (const part of raw.split(/[,;|/\n+]+/)) {
    const p = part.replace(/[.:()[\]]/g, " ").trim();
    if (!p) continue;
    const range = p.match(/^(\d{6})\s*(?:-|–|to)\s*(\d{1,6})$/);
    if (range) {
      const a = +range[1];
      const tail = range[2];
      const b = tail.length === 6 ? +tail : +(range[1].slice(0, 6 - tail.length) + tail);
      if (b >= a && b - a <= 60) for (let i = a; i <= b; i++) pins.push(String(i));
      else bad.push(p);
      continue;
    }
    for (const tok of p.split(/\s+/)) {
      const d = tok.replace(/\.0+$/, "").replace(/\D/g, "");
      if (d.length === 6) pins.push(d);
      else if (tok.trim() && /\d/.test(tok)) bad.push(tok.trim());
    }
  }
  return { pins: [...new Set(pins)], bad };
}
