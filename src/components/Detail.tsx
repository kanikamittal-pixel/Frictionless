"use client";
import { useEffect, useMemo, useState } from "react";
import { useStore, type Brief } from "@/lib/store";
import { useEngine } from "@/lib/useEngine";
import { aiBrief } from "@/lib/ai";
import { buildPlan, fmtDate, INTERVIEW_CHECKS, type Phase } from "@/lib/engine/plan";
import { ARCHETYPE_LABEL } from "@/lib/engine/reference";
import { commitOverride } from "@/lib/actions";
import type { Decision, Result } from "@/lib/engine/types";
import { Btn, DCOLOR, Icon, Pill } from "./ui";
import AppForm from "./AppForm";

// One request per decision state, shared across re-mounts.
const inflight = new Set<string>();
type View = "why" | "plan" | "scores" | "data";
const PHASES: Phase[] = ["Before signing", "Set up", "Train", "Open", "Next step"];

export default function Detail({ id, toast }: { id: string; toast: (s: string) => void }) {
  const { input, out } = useEngine();
  const brand = useStore((s) => s.brand);
  const briefs = useStore((s) => s.briefs);
  const open = useStore((s) => s.open);
  const outcomes = useStore((s) => s.outcomes);
  const batch = useStore((s) => s.batch);
  const [editing, setEditing] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [view, setView] = useState<View>("why");
  const [planLang, setPlanLang] = useState<"English" | "Partner">("English");
  const r = out?.results.find((x) => x.id === id);
  const lang = r?.app.language ?? "English";
  const key = r ? `${r.id}|${r.decision}|${r.score}|${lang}|${r.conditions.length}` : "";
  const brief = briefs[key];
  const [loading, setLoading] = useState(false);
  const [briefErr, setBriefErr] = useState(false);
  const [translating, setTranslating] = useState(false);
  const plan = useMemo(() => (r ? buildPlan(r, brand) : null), [r, brand]);

  useEffect(() => {
    if (!r) return;
    const save = (p: Partial<Brief>) => {
      const st = useStore.getState();
      const cur = st.briefs[key] ?? { explanation: "", partnerMessage: "", steps: null };
      st.set({ briefs: { ...st.briefs, [key]: { ...cur, ...p } } });
    };
    if (!brief?.explanation && !inflight.has(key + "|x")) {
      inflight.add(key + "|x");
      setLoading(true);
      setBriefErr(false);
      aiBrief(r, brand, lang, "explain")
        .then((b) => save({ explanation: b.explanation ?? "", partnerMessage: b.partnerMessage ?? "", model: b.model }))
        .catch(() => setBriefErr(true))
        .finally(() => {
          inflight.delete(key + "|x");
          setLoading(false);
        });
    }
    if (lang !== "English" && !brief?.steps && !inflight.has(key + "|s")) {
      inflight.add(key + "|s");
      setTranslating(true);
      aiBrief(r, brand, lang, "steps")
        .then((b) => b.steps && save({ steps: b.steps }))
        .catch(() => {})
        .finally(() => {
          inflight.delete(key + "|s");
          setTranslating(false);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!r || !out || !input || !plan) return null;
  const translated = planLang === "Partner" && lang !== "English" && brief?.steps;
  const going = r.decision === "Approve" || r.decision === "Conditional";
  const issues = r.issues.filter((i) => i.severity !== "info");

  return (
    <>
      <button className="linkbtn small" onClick={() => open(null)} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Icon name="back" size={14} /> All partners
      </button>

      <div className="detail-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="eyebrow muted">
            {r.id} · {r.app.city || "no city"} {r.app.pin} {r.territoryId ? `· ${r.territoryId}` : ""}
          </p>
          <div className="row wrap" style={{ marginTop: 8 }}>
            <h1 className="h-page" style={{ fontSize: "clamp(2.6rem, 1.6rem + 3.6vw, 5rem)" }}>{r.app.name || "Unnamed applicant"}</h1>
            {r.app.withdrawn ? <span className="pill plain">Withdrawn</span> : <Pill d={r.decision} />}
          </div>
        </div>
        <div className="row">
          <button className="btn ghost plain sm" onClick={() => setEditing(true)}>
            Update details
          </button>
          <button className="btn ghost plain sm" onClick={() => setOverriding(true)}>
            Override
          </button>
        </div>
      </div>
      <p className="lede" style={{ marginTop: 12, color: "var(--ink)", maxWidth: 760 }}>
        {r.override ? `Team override (engine said ${r.engineDecision}): ${r.override.reason}` : r.headline}
      </p>

      <div className="scorecard">
        <div>
          <div className="bigscore" style={{ color: DCOLOR[r.decision] }}>
            {Math.round(r.score)}
            <span className="outline">/100</span>
          </div>
          <p className="eyebrow muted" style={{ marginTop: 14 }}>
            {r.tier ?? "This tier"} bar · {r.threshold}
            {r.rank && (
              <>
                <br />
                Rank {r.rank.territory} of {r.rank.of} · {r.territoryId}
              </>
            )}
          </p>
        </div>
        <div>
          {r.dimensions.map((d) => (
            <div key={d.key} className="dimrow">
              <span className="small">{d.label}</span>
              <span className="track">
                <i className={d.score < 40 ? "lo" : d.score < 70 ? "mid" : ""} style={{ width: `${d.score}%` }} />
              </span>
              <span className="mono small" style={{ textAlign: "right" }}>
                {d.score}
              </span>
            </div>
          ))}
        </div>
      </div>

      {(r.conditions.length > 0 || r.paths.length > 0) && (
        <div className="card paper" style={{ marginTop: 28 }}>
          {r.conditions.length > 0 && (
            <>
              <p className="eyebrow">{going ? "Before signing" : "Open points"}</p>
              <ul className="clean-list" style={{ marginTop: 12 }}>
                {r.conditions.map((c, i) => (
                  <li key={i} className="small">
                    <span className="dot red" />
                    {c.text}
                  </li>
                ))}
              </ul>
            </>
          )}
          {r.paths.length > 0 && (
            <>
              <p className="eyebrow" style={{ marginTop: r.conditions.length ? 22 : 0 }}>
                What would change it
              </p>
              <div className="stack" style={{ marginTop: 10 }}>
                {r.paths.slice(0, 3).map((p, i) => (
                  <div key={i} className="spread small" style={{ gap: 16 }}>
                    <span>{p.label}</span>
                    <Pill d={p.becomes} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="tabs">
        {(
          [
            ["why", "Why"],
            ["plan", going ? "Onboarding plan" : "Next steps"],
            ["scores", "Score details"],
            ["data", `Data${issues.length ? ` (${issues.length})` : ""}`],
          ] as [View, string][]
        ).map(([k, l], i) => (
          <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k)}>
            <i>{String(i + 1).padStart(2, "0")}</i>
            {l}
          </button>
        ))}
      </div>

      {view === "why" && (
        <div className="card dark fade-in">
          <div className="spread">
            <p className="eyebrow">In plain words {brief?.model ? <span className="muted">· {brief.model.replace("google/", "")}</span> : null}</p>
            {loading && (
              <span className="loading-dots">
                <i />
                <i />
                <i />
              </span>
            )}
          </div>
          <p style={{ marginTop: 14, fontSize: "clamp(1.05rem, 1rem + 0.3vw, 1.25rem)", lineHeight: 1.55, letterSpacing: "-0.01em" }}>{brief?.explanation || (loading ? "Writing the explanation from the score breakdown…" : templateReason(r))}</p>
          {briefErr && (
            <p className="xs" style={{ marginTop: 10, opacity: 0.6 }}>
              AI unavailable — this is the engine&apos;s own summary.
            </p>
          )}
          {brief?.partnerMessage && (
            <>
              <div className="divider" />
              <p className="eyebrow">
                Message to the partner · {lang}
              </p>
              <p style={{ marginTop: 10, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{brief.partnerMessage}</p>
            </>
          )}
        </div>
      )}

      {view === "plan" && (
        <div className="fade-in">
          <div className="spread" style={{ flexWrap: "wrap", marginBottom: 16 }}>
            <p className="small muted" style={{ maxWidth: 560 }}>
              {plan.openDate ? (
                <>
                  <b style={{ color: "var(--ink)" }}>Opening {fmtDate(plan.openDate)}.</b> {plan.note}
                </>
              ) : (
                "What happens next for this partner."
              )}
            </p>
            {lang !== "English" && (
              <div className="chips">
                <button className={`chip${planLang === "English" ? " on" : ""}`} onClick={() => setPlanLang("English")}>
                  English
                </button>
                <button className={`chip${planLang === "Partner" ? " on" : ""}`} onClick={() => setPlanLang("Partner")} disabled={!brief?.steps}>
                  {lang}
                  {!brief?.steps && translating ? "…" : ""}
                </button>
              </div>
            )}
          </div>
          <div className="card white">
            {PHASES.filter((ph) => plan.steps.some((s) => s.phase === ph)).map((ph) => {
              const steps = plan.steps.map((s, i) => ({ s, i })).filter(({ s }) => s.phase === ph);
              return (
                <div key={ph} className="phase">
                  <div className="spread">
                    <p className="eyebrow">{ph}</p>
                    <span className="xs faint">
                      {fmtDate(steps[0].s.date)}
                      {steps.length > 1 ? ` – ${fmtDate(steps[steps.length - 1].s.date)}` : ""}
                    </span>
                  </div>
                  <ul className="phase-steps">
                    {steps.map(({ s, i }) => (
                      <li key={i}>
                        <span className="when">{fmtDate(s.date).replace(/ \d{4}$/, "")}</span>
                        <span>
                          <span style={{ fontWeight: 500 }}>{translated ? brief!.steps![i].title : s.title}</span>
                          <span className="muted xs" style={{ display: "block" }}>
                            {translated ? brief!.steps![i].detail : s.detail}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          {going && (
            <div className="grid g2" style={{ marginTop: 16 }}>
              <div className="card">
                <p className="eyebrow">Training · {plan.trainingDays} days in {lang}</p>
                <ul className="clean-list" style={{ marginTop: 12 }}>
                  {brand.training.map((t) => (
                    <li key={t.title} className="small">
                      <span className="dot" />
                      {t.title} · {t.days}d
                    </li>
                  ))}
                </ul>
                <p className="xs muted" style={{ marginTop: 12 }}>
                  Shadow shifts at {r.buddyStore ? `${r.buddyStore.id}, ${r.buddyStore.city} (~${r.buddyStore.km} km)` : "the nearest store"}.
                </p>
              </div>
              <div className="card">
                <p className="eyebrow">Check in the interview</p>
                <p className="xs muted" style={{ marginTop: 4 }}>
                  Not in the sheets, not scored.
                </p>
                <ul className="clean-list" style={{ marginTop: 12 }}>
                  {INTERVIEW_CHECKS.map((c) => (
                    <li key={c} className="small">
                      <span className="dot" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {going && batch && <OutcomeBox batchId={batch.id} r={r} saved={outcomes[`${batch.id}|${r.id}`]} />}
        </div>
      )}

      {view === "scores" && (
        <div className="fade-in">
          {r.dimensions.map((d) => (
            <div key={d.key} className="card white" style={{ marginBottom: 12 }}>
              <div className="spread">
                <p className="eyebrow">{d.label}</p>
                <span className="mono small">
                  {d.score} <span className="faint">/ 100 · {d.points} pts</span>
                </span>
              </div>
              <ul className="clean-list" style={{ marginTop: 12 }}>
                {d.factors.map((f) => (
                  <li key={f.key} className="small">
                    <span className={`dot ${f.score >= 7 ? "green" : f.score >= 4 ? "amber" : "red"}`} />
                    <span>
                      <b>{f.label}</b> <span className="mono faint">{f.score}/10</span> — {f.evidence} {f.assumed && <span className="tag amber">assumed</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="card" style={{ marginTop: 4 }}>
            <p className="small">
              <b>Locality:</b> {r.locality?.name ?? "Unknown"} · {r.locality ? ARCHETYPE_LABEL[r.locality.archetype] : "—"} ({r.locality?.confidence === "mapped" ? "built-in map" : r.locality?.confidence === "ai" ? "AI estimate" : "city baseline"})
            </p>
            {r.nearestStore && (
              <p className="small" style={{ marginTop: 6 }}>
                <b>Nearest own store:</b> {r.nearestStore.id}, {r.nearestStore.approx ? "~" : ""}
                {r.nearestStore.km} km
              </p>
            )}
            {r.alternatives.length > 0 && (
              <p className="small" style={{ marginTop: 6 }}>
                <b>Open pins nearby:</b> {r.alternatives.map((a) => `${a.pin} (${a.territory})`).join(", ")}
              </p>
            )}
            {r.payback?.months ? (
              <p className="small" style={{ marginTop: 6 }}>
                <b>Indicative payback:</b> ~{r.payback.months} months (₹{r.payback.capex}L setup, ~₹{r.payback.monthlyProfit}L/month)
              </p>
            ) : null}
          </div>
        </div>
      )}

      {view === "data" && (
        <div className="fade-in">
          {r.flags.length + r.issues.length > 0 ? (
            <ul className="clean-list">
              {r.flags.map((f) => (
                <li key={f} className="small">
                  <span className="dot red" />
                  {f}
                </li>
              ))}
              {r.issues.map((i, k) => (
                <li key={k} className="small">
                  <span className={`dot ${i.severity === "block" ? "red" : i.severity === "warn" ? "amber" : ""}`} />
                  {i.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">Every cell in this row was clean.</p>
          )}
          {r.app.raw && (
            <div className="card white" style={{ marginTop: 20 }}>
              <p className="eyebrow muted">Original row {r.app.row ? `· sheet row ${r.app.row}` : ""}</p>
              <table className="table" style={{ marginTop: 8 }}>
                <tbody>
                  {Object.entries(r.app.raw).map(([k, v]) => (
                    <tr key={k}>
                      <td className="muted small" style={{ width: "40%" }}>
                        {k}
                      </td>
                      <td className="small">{v === null || v === undefined || v === "" ? <i className="faint">blank</i> : String(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {editing && (
        <AppForm
          app={input.applications.find((a) => a.id === r.id)}
          onClose={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            toast("Applied — decisions re-run");
          }}
        />
      )}
      {overriding && <OverrideModal r={r} toast={toast} onClose={() => setOverriding(false)} />}
    </>
  );
}

/** The engine's own explanation, used when the AI is unavailable. */
function templateReason(r: Result): string {
  const dims = r.dimensions.map((d) => `${d.label} ${d.score}`).join(" · ");
  const weak = [...r.dimensions].sort((a, b) => a.score - b.score)[0];
  let s = `${r.id}: ${r.decision} (${r.score.toFixed(0)}/100). ${r.headline} Scores — ${dims}.`;
  if (r.decision !== "Approve" && weak) s += ` Weakest area: ${weak.label.toLowerCase()}.`;
  if (r.paths[0]) s += ` What would change it: ${r.paths[0].label.toLowerCase()} → ${r.paths[0].becomes}.`;
  return s;
}

function OverrideModal({ r, toast, onClose }: { r: Result; toast: (s: string) => void; onClose: () => void }) {
  const [d, setD] = useState<Decision>(r.decision);
  const [why, setWhy] = useState("");
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow muted">Team decision</p>
        <h2 style={{ fontSize: 26, marginTop: 6 }}>Override {r.id}</h2>
        <p className="small muted" style={{ marginTop: 8 }}>
          The engine recommends; the team decides. Overrides need a reason, are logged, and survive re-runs.
        </p>
        <div className="row wrap" style={{ marginTop: 18 }}>
          {(["Approve", "Conditional", "Hold", "Reject"] as Decision[]).map((x) => (
            <button key={x} className={`chip${d === x ? " on" : ""}`} onClick={() => setD(x)}>
              {x}
            </button>
          ))}
        </div>
        <input className="input" style={{ marginTop: 14 }} placeholder="Reason (required)" value={why} onChange={(e) => setWhy(e.target.value)} />
        <div className="row" style={{ marginTop: 18, justifyContent: "space-between" }}>
          {r.override ? (
            <button
              className="linkbtn small"
              onClick={() => {
                commitOverride(r.id, null, `Removed override on ${r.id}`);
                toast("Override removed");
                onClose();
              }}
            >
              Remove current override
            </button>
          ) : (
            <span />
          )}
          <div className="row">
            <button className="btn ghost plain sm" onClick={onClose}>
              Cancel
            </button>
            <Btn
              small
              variant="red"
              disabled={!why.trim()}
              onClick={() => {
                commitOverride(r.id, { decision: d, reason: why.trim(), at: new Date().toISOString() }, `Team set ${r.id} to ${d}: ${why.trim()}`);
                toast(`${r.id} set to ${d} by the team`);
                onClose();
              }}
            >
              Save
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function OutcomeBox({ batchId, r, saved }: { batchId: string; r: Result; saved?: { opened: boolean; onTime: boolean; paybackMonths: number | null; note: string } }) {
  const [opened, setOpened] = useState(saved?.opened ?? true);
  const [onTime, setOnTime] = useState(saved?.onTime ?? true);
  const [pb, setPb] = useState(saved?.paybackMonths?.toString() ?? "");
  const [done, setDone] = useState(!!saved);
  return (
    <details className="card" style={{ marginTop: 16 }}>
      <summary className="eyebrow muted" style={{ cursor: "pointer" }}>
        Later: record what happened {done && <span className="tag green">saved</span>}
      </summary>
      <p className="xs muted" style={{ marginTop: 10 }}>
        Outcomes feed the pattern finder in Insights.
      </p>
      <div className="row wrap" style={{ marginTop: 12 }}>
        <button className={`chip${opened ? " on" : ""}`} onClick={() => setOpened(!opened)}>
          {opened ? "Store opened" : "Did not open"}
        </button>
        <button className={`chip${onTime ? " on" : ""}`} onClick={() => setOnTime(!onTime)}>
          {onTime ? "On time" : "Late"}
        </button>
        <input className="input" style={{ width: 160 }} placeholder="Payback (months)" value={pb} onChange={(e) => setPb(e.target.value)} />
        <Btn
          small
          arrow={false}
          onClick={() => {
            const o = { opened, onTime, paybackMonths: pb ? Number(pb) : null, note: "" };
            const st = useStore.getState();
            st.set({ outcomes: { ...st.outcomes, [`${batchId}|${r.id}`]: o } });
            fetch("/api/outcome", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId, appId: r.id, ...o }) }).catch(() => {});
            setDone(true);
          }}
        >
          Save
        </Btn>
      </div>
    </details>
  );
}
