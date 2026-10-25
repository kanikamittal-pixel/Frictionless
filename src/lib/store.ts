"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Application, BrandProfile, Decision, Issue, Locality, Override, Rubric, Store, Territory, TextTags } from "./engine/types";
import type { ChangeEntry, DiffRow, Edit } from "./engine/patch";
import { DEFAULT_RUBRIC } from "./engine/rubric";
import { buildProfile } from "./engine/brand";
import { normId } from "./engine/normalize";

export type Tab = "overview" | "decisions" | "territories" | "insights" | "settings";
export type Sub = "rubric" | "health" | "log" | "method";

export interface Batch {
  id: string;
  fileName: string;
  uploadedAt: string;
  sheets: { name: string; kind: string; rows: number }[];
  parseIssues: Issue[];
  storesSource: "workbook" | "built-in";
  applications: Application[];
  territories: Territory[];
  stores: Store[];
}

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: string;
  source?: "ai" | "rules";
  proposal?: {
    edits: Edit[];
    assumptions: string[];
    lines: string[];
    impact: DiffRow[];
    status: "pending" | "applied" | "discarded";
    errors: string[];
  };
  override?: { id: string; decision: Override["decision"]; reason: string; status: "pending" | "applied" | "discarded"; from: string };
}

export interface Brief {
  explanation: string;
  partnerMessage: string;
  steps: { title: string; detail: string }[] | null;
  model?: string;
}

export interface Outcome {
  opened: boolean;
  onTime: boolean;
  paybackMonths: number | null;
  note: string;
}

export interface Setup {
  industryKey: string;
  modelKey: string;
  customIndustry: string;
  customModel: string;
  builtFor?: string;
}

interface State {
  setup: Setup;
  brand: BrandProfile;
  rubric: Rubric;
  rubricHistory: Rubric[];
  rubricDraft: { rubric: Rubric; why: string[] } | null;
  batch: Batch | null;
  changes: ChangeEntry[];
  overrides: Record<string, Override>;
  tags: Record<string, TextTags>;
  localities: Record<string, Locality>;
  ai: { tags: "idle" | "running" | "done" | "failed"; places: "idle" | "running" | "done" | "failed"; model?: string };
  chat: ChatMsg[];
  briefs: Record<string, Brief>;
  outcomes: Record<string, Outcome>;
  tab: Tab;
  selected: string | null;
  filter: Decision | "All";
  sub: Sub;
  chatOpen: boolean;
  criteriaOpen: boolean;
  atHome: boolean; // on the landing page with a batch still loaded
  set: (p: Partial<State>) => void;
  setSetup: (s: Partial<Setup>) => void;
  loadBatch: (b: Batch) => void;
  addChange: (c: ChangeEntry) => void;
  undoChange: (id: string) => void;
  setOverride: (id: string, o: Override | null) => void;
  pushChat: (m: ChatMsg) => void;
  patchChat: (id: string, p: Partial<ChatMsg>) => void;
  open: (id: string | null) => void;
  newBatch: () => void;
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      setup: { industryKey: "eyewear", modelKey: "fofo", customIndustry: "", customModel: "" },
      brand: buildProfile("eyewear", "fofo"),
      rubric: DEFAULT_RUBRIC,
      rubricHistory: [DEFAULT_RUBRIC],
      rubricDraft: null,
      batch: null,
      changes: [],
      overrides: {},
      tags: {},
      localities: {},
      ai: { tags: "idle", places: "idle" },
      chat: [],
      briefs: {},
      outcomes: {},
      tab: "overview",
      selected: null,
      filter: "All",
      sub: "rubric",
      chatOpen: true,
      criteriaOpen: true,
      atHome: false,
      set: (p) => set(p),
      setSetup: (s) => set({ setup: { ...get().setup, ...s } }),
      loadBatch: (b) => set({ atHome: false, batch: b, changes: [], overrides: {}, tags: {}, chat: [], briefs: {}, outcomes: {}, tab: "overview", selected: null, ai: { tags: "idle", places: "idle" } }),
      addChange: (c) => set({ changes: [...get().changes, c] }),
      undoChange: (id) => set({ changes: get().changes.filter((c) => c.id !== id) }),
      setOverride: (id, o) => {
        const next = { ...get().overrides };
        if (o) next[id] = o;
        else delete next[id];
        set({ overrides: next });
      },
      pushChat: (m) => set({ chat: [...get().chat, m] }),
      patchChat: (id, p) => set({ chat: get().chat.map((m) => (m.id === id ? { ...m, ...p } : m)) }),
      open: (id) => set({ selected: id ? normId(id) : null, tab: id ? "decisions" : get().tab }),
      newBatch: () => set({ batch: null, changes: [], overrides: {}, tags: {}, chat: [], briefs: {}, selected: null, tab: "overview" }),
    }),
    {
      name: "outpost-workspace-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        setup: s.setup, brand: s.brand, rubric: s.rubric, rubricHistory: s.rubricHistory, batch: s.batch, changes: s.changes,
        overrides: s.overrides, tags: s.tags, localities: s.localities, chat: s.chat, briefs: s.briefs, outcomes: s.outcomes, chatOpen: s.chatOpen, criteriaOpen: s.criteriaOpen,
      }),
    },
  ),
);
