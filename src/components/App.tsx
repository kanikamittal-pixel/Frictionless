"use client";
import { useEffect, useRef, useState } from "react";
import { useStore, uid, type Tab } from "@/lib/store";
import { useEngine } from "@/lib/useEngine";
import { parseWorkbook } from "@/lib/engine/parse";
import { upgradeRubric } from "@/lib/engine/rubric";
import { aiCompetitors, aiLocalities, aiTags, saveBatch } from "@/lib/ai";
import { Icon, LogoMark, Ruler, ThemeToggle } from "./ui";
import Setup from "./Setup";
import Overview from "./Overview";
import Decisions from "./Decisions";
import Territories from "./Territories";
import Insights from "./Insights";
import Settings from "./Settings";
import Chat from "./Chat";
import Terrain from "./Terrain";
import CriteriaPanel from "./CriteriaPanel";
import ScoringPage from "./ScoringPage";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "decisions", label: "Partners" },
  { key: "territories", label: "Territories" },
  { key: "insights", label: "Insights" },
  { key: "settings", label: "Settings" },
];

type StepState = "wait" | "run" | "done" | "skip";
interface Proc {
  file: string;
  steps: { label: string; detail: string; state: StepState }[];
  error?: string;
}

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const s = useStore();
  const { out } = useEngine();
  const [status, setStatus] = useState<{ ai: boolean; db: boolean } | null>(null);
  const [proc, setProc] = useState<Proc | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [homeTab, setHomeTab] = useState<"home" | "scoring">("home");
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHydrated(useStore.persist.hasHydrated());
    // On narrow screens the analyst panel covers the page, so start it closed.
    if (window.innerWidth < 1180) useStore.getState().set({ chatOpen: false, criteriaOpen: false });
    const unsub = useStore.persist.onFinishHydration(() => setHydrated(true));
    fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => setStatus({ ai: false, db: false }));
    fetch("/api/rubric")
      .then((r) => r.json())
      .then((j) => {
        const latest = j.versions?.[0];
        const st = useStore.getState();
        if (latest && latest.version > st.rubric.version) st.set({ rubric: upgradeRubric(latest), rubricHistory: [...j.versions].reverse() });
      })
      .catch(() => {});
    return unsub;
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // Brand changed after upload: rate competitors for the new category.
  useEffect(() => {
    if (!s.batch || proc || (status && !status.ai)) return;
    const key = s.brand.industryKey;
    const pins = [...new Set(s.batch.applications.map((a) => a.pin))].filter(Boolean);
    if (!pins.length || pins.some((p) => s.competition[`${key}|${p}`])) return;
    aiCompetitors(pins, s.brand, s.localities)
      .then((r) => {
        const add = Object.fromEntries(Object.entries(r.estimates).map(([p, v]) => [`${key}|${p}`, v]));
        if (Object.keys(add).length) useStore.getState().set({ competition: { ...useStore.getState().competition, ...add } });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.batch?.id, s.brand.industryKey, proc]);

  // Mirror every batch (and every change) to the database for Insights.
  useEffect(() => {
    if (!out || !s.batch || proc) return;
    const t = setTimeout(() => {
      saveBatch({
        id: s.batch!.id,
        fileName: s.batch!.fileName,
        brand: { industry: s.brand.industry, model: s.brand.model, industryKey: s.brand.industryKey, modelKey: s.brand.modelKey },
        rubricVersion: s.rubric.version,
        summary: out.summary,
        results: out.results.map((r) => ({ id: r.id, name: r.app.name, city: r.app.city, pin: r.app.pin, tier: r.tier, territory: r.territoryId, decision: r.decision, engineDecision: r.engineDecision, score: r.score, partnerScore: r.partnerScore, locationScore: r.locationScore, headline: r.headline, slot: r.slot, gate: r.gate, factors: r.factors.map((f) => ({ key: f.key, group: f.group, score: f.score })), issues: r.issues.filter((i) => i.severity !== "info").map((i) => i.code) })),
        territories: out.territories.map((t) => ({ id: t.id, city: t.territory.city, capacity: t.capacity, applicants: t.applicants.length, allocated: t.allocated.length, waitlist: t.waitlist.length, priority: t.territory.priority })),
        changeLog: s.changes,
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [out, s.batch, s.changes, s.brand, s.rubric.version, proc]);

  async function ingest(buf: ArrayBuffer, fileName: string) {
    const steps: Proc["steps"] = [
      { label: "Reading the workbook", detail: "Finding the Applications, Territories and Existing stores sheets by their headers", state: "run" },
      { label: "Checking every row", detail: "Allowed values, blanks, contradictions, duplicates", state: "wait" },
      { label: "Building the map", detail: "Pin code → territory, open slots, pins already served by a store", state: "wait" },
      { label: "Reading the free text", detail: "AI tags business relevance, urgency, red flags and contradictions", state: "wait" },
      { label: "Placing each pin code", detail: "Locality type for pins not on the built-in map", state: "wait" },
      { label: "Checking competitors nearby", detail: "How crowded each pin is with the brand's category", state: "wait" },
      { label: "Gate, score and allocate", detail: "Phase 1 territory check, 100-point rubric, best score wins each slot", state: "wait" },
    ];
    const upd = (i: number, state: StepState, detail?: string) => {
      steps[i] = { ...steps[i], state, detail: detail ?? steps[i].detail };
      setProc({ file: fileName, steps: [...steps] });
    };
    setProc({ file: fileName, steps: [...steps] });
    let wb;
    try {
      wb = parseWorkbook(buf);
    } catch (e) {
      setProc({ file: fileName, steps, error: `Could not read this file as Excel: ${String(e)}` });
      return;
    }
    if (!wb.applications.length) {
      setProc({ file: fileName, steps, error: wb.issues.map((i) => i.message).join(" ") || "No applications found." });
      return;
    }
    upd(0, "done", wb.sheets.map((x) => `${x.name} → ${x.kind}${x.kind !== "ignored" ? ` (${x.rows} rows)` : ""}`).join(" · ") + (wb.storesSource === "built-in" ? " · existing stores: built-in Sheet 3" : ""));
    const batch = { id: uid() + uid(), fileName, uploadedAt: new Date().toISOString(), sheets: wb.sheets, parseIssues: wb.issues, storesSource: wb.storesSource, applications: wb.applications, territories: wb.territories, stores: wb.stores };
    const parseFlags = wb.applications.reduce((a, x) => a + x.parseIssues.filter((i) => i.severity !== "info").length, 0);
    upd(1, "done", `${wb.applications.length} applications · ${parseFlags} cell-level issue${parseFlags === 1 ? "" : "s"} found and handled`);
    const pins = wb.territories.reduce((a, t) => a + t.pins.length, 0);
    upd(2, "done", `${wb.territories.length} territories · ${pins} pin codes · ${wb.stores.length} existing stores`);

    const st = useStore.getState();
    st.loadBatch(batch);
    if (status && !status.ai) {
      upd(3, "skip", "AI unavailable — used the rule-based reader");
      upd(4, "skip", "Using the built-in pin map and city baselines");
      upd(5, "skip", "Estimated from each locality type");
    } else {
      upd(3, "run");
      upd(4, "run");
      upd(5, "run");
      const tagJob = aiTags(wb.applications, st.brand)
        .then((r) => {
          useStore.getState().set({ tags: r.tags, ai: { ...useStore.getState().ai, tags: "done", model: r.model } });
          upd(3, "done", `${Object.keys(r.tags).length} applications read by ${r.model.replace("google/", "")}${r.failed.length ? ` · ${r.failed.length} fell back to rules` : ""}`);
        })
        .catch(() => upd(3, "skip", "AI did not answer in time — used the rule-based reader"));
      const placeJob = aiLocalities([...wb.applications.map((a) => a.pin), ...wb.territories.flatMap((t) => t.pins)], st.localities)
        .then((r) => {
          const n = Object.keys(r.localities).length;
          useStore.getState().set({ localities: { ...useStore.getState().localities, ...r.localities } });
          upd(4, "done", n ? `${n} pin code${n === 1 ? "" : "s"} placed (AI estimate, labelled as such)` : "All pins are on the built-in map");
        })
        .catch(() => upd(4, "skip", "Using the built-in pin map and city baselines"));
      const compJob = aiCompetitors(wb.applications.map((a) => a.pin), st.brand, st.localities)
        .then((r) => {
          const key = st.brand.industryKey;
          const add = Object.fromEntries(Object.entries(r.estimates).map(([p, v]) => [`${key}|${p}`, v]));
          const n = Object.keys(add).length;
          useStore.getState().set({ competition: { ...useStore.getState().competition, ...add } });
          upd(5, n ? "done" : "skip", n ? `${n} pin code${n === 1 ? "" : "s"} rated for ${st.brand.industry.toLowerCase()} (AI estimate; applicants' own notes take priority)` : "Estimated from each locality type");
        })
        .catch(() => upd(5, "skip", "Estimated from each locality type"));
      await Promise.all([tagJob, placeJob, compJob]);
    }
    upd(6, "run");
    await new Promise((r) => setTimeout(r, 350));
    upd(6, "done");
    await new Promise((r) => setTimeout(r, 450));
    setProc(null);
    useStore.getState().set({ tab: "overview", selected: null });
  }

  const go = (t: Tab) => {
    s.set({ tab: t, selected: null });
    mainRef.current?.scrollIntoView();
    window.scrollTo({ top: 0 });
  };

  if (!hydrated) return <div className="shell" />;

  const showWorkspace = !!s.batch && !proc && !!out && !s.atHome;
  const chatVisible = showWorkspace && s.chatOpen;
  const criteriaVisible = showWorkspace && s.criteriaOpen;

  return (
    <>
      <header className="bar">
        <button className="logo" onClick={() => (showWorkspace ? go("overview") : undefined)} aria-label="Outpost overview">
          <LogoMark />
          <span className={`brandname${showWorkspace ? " in-app" : ""}`}>
            <b>Outpost</b>
            <span>/ Franchise engine</span>
          </span>
        </button>
        {showWorkspace ? (
          <nav className="nav">
            {TABS.map((t, i) => (
              <button key={t.key} className={s.tab === t.key ? "on" : ""} onClick={() => go(t.key)}>
                <i>{String(i + 1).padStart(2, "0")}</i>
                {t.label}
              </button>
            ))}
          </nav>
        ) : !proc ? (
          <nav className="nav">
            {(
              [
                ["home", "Home"],
                ["scoring", "Scoring"],
              ] as const
            ).map(([k, l], i) => (
              <button
                key={k}
                className={homeTab === k ? "on" : ""}
                onClick={() => {
                  setHomeTab(k);
                  window.scrollTo({ top: 0 });
                }}
              >
                <i>{String(i + 1).padStart(2, "0")}</i>
                {l}
              </button>
            ))}
          </nav>
        ) : (
          <div style={{ flex: 1 }} />
        )}
        <div className="bar-right">
          {status && (
            <div className="status" title="Live services">
              <span>
                <i className={status.ai ? "ok" : "off"} />
                AI
              </span>
              <span>
                <i className={status.db ? "ok" : "off"} />
                DB
              </span>
            </div>
          )}
          <ThemeToggle />

          {showWorkspace && (
            <>
              <button className={`btn sm ghost hide-sm${s.criteriaOpen ? " is-on" : ""}`} onClick={() => s.set({ criteriaOpen: !s.criteriaOpen })} title="Show how partners are scored">
                Criteria
              </button>
              <button className="btn sm" onClick={() => s.set({ chatOpen: !s.chatOpen })} style={s.chatOpen ? { background: "var(--accent)", borderColor: "var(--accent)", color: "var(--on-accent)" } : undefined}>
                {s.chatOpen ? "Close" : "Ask"}
              </button>
              <button className="btn sm ghost exit-btn" onClick={() => {
                  s.set({ atHome: true, selected: null });
                  window.scrollTo({ top: 0 });
                }} title="Back to the home page — your batch is kept">
                <Icon name="back" size={14} />
                Exit
              </button>
            </>
          )}
        </div>
      </header>
      <Ruler />

      <div className={`frame shell${chatVisible ? " with-chat" : ""}${criteriaVisible ? " with-criteria" : ""}`}>
        <main className="main" ref={mainRef}>
          {proc ? (
            <Processing proc={proc} onBack={() => setProc(null)} />
          ) : !showWorkspace && homeTab === "scoring" ? (
            <ScoringPage
              onBack={() => {
                setHomeTab("home");
                window.scrollTo({ top: 0 });
              }}
            />
          ) : !showWorkspace ? (
            <Setup
              onScoring={() => {
                setHomeTab("scoring");
                window.scrollTo({ top: 0 });
              }} onFile={ingest} aiOn={status?.ai ?? true} resume={s.batch && s.atHome ? { file: s.batch.fileName, count: s.batch.applications.length, at: s.batch.uploadedAt } : null} onResume={() => {
              s.set({ atHome: false });
              window.scrollTo({ top: 0 });
            }} />
          ) : (
            <div className="page fade-in" key={s.tab + (s.selected ?? "") + (s.tab === "settings" ? s.sub : "")}>
              {s.tab === "overview" && <Overview />}
              {s.tab === "decisions" && <Decisions toast={setToast} />}
              {s.tab === "territories" && <Territories toast={setToast} />}
              {s.tab === "insights" && <Insights toast={setToast} dbOn={!!status?.db} />}
              {s.tab === "settings" && <Settings toast={setToast} />}
            </div>
          )}
        </main>
        {showWorkspace && <Chat open={s.chatOpen} aiOn={status?.ai ?? true} toast={setToast} />}
        {showWorkspace && <CriteriaPanel />}
      </div>
      {toast && <div className="toast fade-in">{toast}</div>}
    </>
  );
}

function Processing({ proc, onBack }: { proc: Proc; onBack: () => void }) {
  const done = proc.steps.filter((x) => x.state === "done" || x.state === "skip").length;
  return (
    <Terrain className="proc-band" scale={1.3} seed={3} crosshair={false} fade={false} intensity={0.55}>
    <div className="proc fade-in">
      <div className="spread">
        <p className="eyebrow">Processing</p>
        <p className="eyebrow muted">
          {String(done).padStart(2, "0")} / {String(proc.steps.length).padStart(2, "0")}
        </p>
      </div>
      <h2 className="h-page" style={{ marginTop: 18, fontSize: "clamp(1.8rem, 1rem + 2.4vw, 3.1rem)", overflowWrap: "anywhere" }}>{proc.file}</h2>
      <div style={{ marginTop: 36, borderTop: "1px solid var(--line-strong)" }}>
        {proc.steps.map((st, i) => (
          <div key={i} className="pstep">
            <span className={`pdot ${st.state === "done" || st.state === "skip" ? "done" : st.state === "run" ? "run" : ""}`}>
              [{String(i + 1).padStart(2, "0")}]
            </span>
            <div>
              <div className="spread">
                <span style={{ fontSize: 18, letterSpacing: "-0.02em", color: st.state === "wait" ? "var(--faint)" : "var(--ink)" }}>{st.label}</span>
                <span className="eyebrow" style={{ color: st.state === "run" ? "var(--accent)" : st.state === "wait" ? "var(--faint)" : "var(--muted)" }}>
                  {st.state === "done" ? "Done ✓" : st.state === "skip" ? "Fallback" : st.state === "run" ? (
                    <span className="loading-dots">
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : "Queued"}
                </span>
              </div>
              <p className="small muted" style={{ marginTop: 2 }}>{st.detail}</p>
            </div>
          </div>
        ))}
      </div>
      {proc.error && (
        <div className="notice" style={{ marginTop: 24 }}>
          <b>Couldn&apos;t process this file.</b> {proc.error}
          <div style={{ marginTop: 12 }}>
            <button className="btn sm ghost" onClick={onBack}>
              Back
            </button>
          </div>
        </div>
      )}
    </div>
    </Terrain>
  );
}
