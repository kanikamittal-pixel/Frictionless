// Shared types for the Outpost decision engine. The engine is a pure function:
// (applications, territories, stores, brand, rubric, tags, edits) -> decisions.

export type Tier = "Tier 1" | "Tier 2" | "Tier 3";
export type Priority = "High" | "Medium" | "Low";
export type SpaceStatus = "Owned" | "Rented" | "Not yet identified";
export type Floor = "Ground" | "Upper" | "Mall unit" | "Not known";
export type Language = "Kannada" | "English" | "Hindi";
export type Decision = "Approve" | "Conditional" | "Hold" | "Reject";

export type Severity = "block" | "warn" | "info";

export interface Issue {
  severity: Severity;
  field?: string;
  code: string;
  message: string;
}

export interface Application {
  id: string;
  name: string;
  city: string;
  state: string;
  pin: string;
  investment: number | null; // ₹ lakh
  experience: number | null; // years
  business: string;
  space: SpaceStatus | null;
  size: number | null; // sq ft
  floor: Floor | null;
  launch: number | null; // months
  language: Language | null;
  notes: string;
  withdrawn?: boolean;
  row: number; // source row in the sheet, 0 for apps added in-app
  raw?: Record<string, unknown>;
  parseIssues: Issue[];
}

export interface Territory {
  id: string;
  city: string;
  state: string;
  pins: string[];
  tier: Tier | null;
  slots: number | null;
  priority: Priority | null;
  row: number;
  parseIssues: Issue[];
}

export interface Store {
  id: string;
  city: string;
  pin: string;
  opened: number | null;
}

/** What the AI (or the rule fallback) reads out of free text. Never a score. */
export interface TextTags {
  category: string; // what the applicant does, in 2-4 words
  relevance: "direct" | "adjacent" | "unrelated" | "none";
  urgency: "high" | "normal" | "low";
  deadline?: string; // e.g. "before Diwali"
  intent: "strong" | "generic" | "weak"; // depth of research / seriousness
  redFlags: string[];
  positives: string[];
  locationCues: string[]; // "near bus stand", "main road"
  contradictions: string[]; // notes vs structured fields
  fills?: Fills; // values stated in the free text for cells left blank
  source: "ai" | "rules";
}

export interface Fills {
  investment?: number;
  size?: number;
  floor?: Floor;
  space?: SpaceStatus;
  launch?: number;
  experience?: number;
}

export interface Locality {
  pin: string;
  name: string;
  archetype: Archetype;
  lat?: number;
  lng?: number;
  confidence: "mapped" | "ai" | "estimated";
}

export type Archetype =
  | "cbd"
  | "high-street"
  | "transit"
  | "it-corridor"
  | "premium-residential"
  | "residential"
  | "peri-urban"
  | "industrial"
  | "unknown";

export interface BrandProfile {
  industry: string;
  model: string;
  industryKey: string;
  modelKey: string;
  sqft: { min: number; idealMin: number; idealMax: number; max: number };
  capexLakh: Record<Tier, number>; // what the partner must fund to open
  relevantWords: string[];
  adjacentWords: string[];
  footfall: "high" | "medium" | "low";
  groundCritical: boolean;
  mallFit: "good" | "ok" | "poor";
  partnerOperates: boolean;
  needsExistingBusiness: boolean;
  leadMonths: { withSpace: number; withoutSpace: number };
  staff: number;
  licences: string[];
  training: { title: string; days: number }[];
  revenueLakhPerMonth: Record<Tier, number>;
  marginPct: number;
  triggers: string[]; // JTBD trigger places for this category
  summary: string;
}

export interface Rubric {
  version: number;
  note: string;
  createdAt: string;
  blend: { partner: number; location: number }; // sums to 100
  partner: { floor: number; size: number; ownership: number; financial: number; operational: number; speed: number; local: number };
  location: { strategic: number; demographic: number; jtbd: number; supply: number; economics: number; competition: number };
  approveMin: Record<Tier, number>; // tier minimums for Approve
  conditionalMin: number;
  rejectBelow: number;
  capitalFloor: number; // reject if investment < this share of capex
  saturationKm: number; // own-store closer than this hurts the competition score
}

export interface Factor {
  key: string;
  label: string;
  group: "partner" | "location";
  weight: number; // points out of 100 within its group
  score: number; // 0-10
  evidence: string;
  assumed?: boolean;
}

export interface Condition {
  code: string;
  text: string;
  lever?: string; // what the partner must do
}

export interface AltPin {
  pin: string;
  territory: string;
  locality: string;
  km?: number;
}

export interface Result {
  id: string;
  app: Application;
  territoryId: string | null;
  tier: Tier | null;
  locality: Locality | null;
  decision: Decision;
  engineDecision: Decision; // before any team override
  override?: Override;
  headline: string; // one-line reason
  reasons: string[];
  conditions: Condition[];
  issues: Issue[];
  flags: string[];
  factors: Factor[];
  dimensions: import("./dimensions").Dimension[];
  partnerScore: number;
  locationScore: number;
  score: number;
  threshold: number;
  rank?: { territory: number; of: number };
  slot: "won" | "lost-pin" | "waitlist" | "none" | "outside";
  pinRival?: string; // who beat or is behind them on the same pin
  nextInLine?: string;
  alternatives: AltPin[];
  nearestStore?: { id: string; km: number; approx: boolean };
  buddyStore?: { id: string; city: string; km: number };
  payback?: { months: number; capex: number; monthlyProfit: number };
  paths: PathToYes[];
  gate: "pass" | "fallback" | "fail" | "n/a";
}

export interface PathToYes {
  label: string;
  becomes: Decision;
  score: number;
}

export interface TerritoryResult {
  id: string;
  territory: Territory;
  tier: Tier | null; // official tier for the city
  capacity: number; // min(slots, free pins)
  blockedPins: { pin: string; store: string }[];
  applicants: string[];
  allocated: string[];
  waitlist: string[];
  demandRatio: number;
  issues: Issue[];
  note: string;
}

export interface Override {
  decision: Decision;
  reason: string;
  at: string;
}

export interface EngineInput {
  applications: Application[];
  territories: Territory[];
  stores: Store[];
  brand: BrandProfile;
  rubric: Rubric;
  tags: Record<string, TextTags>;
  localities: Record<string, Locality>;
  overrides: Record<string, Override>;
  edited?: Record<string, string[]>; // application id -> fields the team corrected after upload
}

export interface BatchSummary {
  total: number;
  counts: Record<Decision, number>;
  slotsOpen: number;
  slotsFilled: number;
  gateScenario: "A" | "B" | "none";
  dataIssues: number;
  contestedPins: number;
}

export interface EngineOutput {
  results: Result[];
  territories: TerritoryResult[];
  summary: BatchSummary;
  batchIssues: Issue[];
  latentDemand: { city: string; count: number; avgScore: number }[];
  ranAt: string;
}
