"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useEngine, preview } from "@/lib/useEngine";
import { LOCATION_LABELS, PARTNER_LABELS, rubricTotalOk } from "@/lib/engine/rubric";
import type { Rubric, Tier } from "@/lib/engine/types";
import { Btn } from "./ui";
import DiffList from "./DiffList";

export default function RubricView({ toast }: { toast: (s: string) => void }) {
  const { input, out } = useEngine();
  const rubric = useStore((s) => s.rubric);
  const history = useStore((s) => s.rubricHistory);
  const draftState = useStore((s) => s.rubricDraft);
  const set = useStore((s) => s.set);
  const [draft, setDraft] = useState<Rubric>(() => structuredClone(draftState?.rubric ?? rubric));
  const [note, setNote] = useState(draftState?.why.length ? "Pattern finder proposal" : "");
  const [saving, setSaving] = useState(false);
  const bad = rubricTotalOk(draft);
  const changed = JSON.stringify({ ...draft, note: "", version: 0, createdAt: "" }) !== JSON.stringify({ ...rubric, note: "", version: 0, createdAt: "" });
  const sim = useMemo(() => (input && out && changed && !bad ? preview(input, out, { rubric: draft }) : null), [input, out, draft, changed, bad]);
  const diff = sim?.diff ?? [];
  const movers = useMemo(() => {
    if (!sim || !out) return [];
    const before = new Map(out.results.map((r) => [r.id, r.score]));
    return sim.next.results
      .map((r) => ({ id: r.id, from: before.get(r.id) ?? r.score, to: r.score }))
      .filter((m) => Math.abs(m.to - m.from) >= 0.1)
      .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
  }, [sim, out]);
  if (!input || !out) return null;

  const num = (v: string) => (v === "" ? 0 : Number(v));
  const sumP = Object.values(draft.partner).reduce((a, b) => a + b, 0);
  const sumL = Object.values(draft.location).reduce((a, b) => a + b, 0);

  async function approve() {
    setSaving(true);
    const next: Rubric = { ...draft, version: rubric.version + 1, note: note.trim() || "Updated by the team", createdAt: new Date().toISOString() };
    try {
      const r = await fetch("/api/rubric", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rubric: next }) }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      if (r.version) next.version = r.version;
    } catch (e) {
      toast(`Saved in this browser only (${String(e).slice(0, 60)})`);
    }
    set({ rubric: next, rubricHistory: [...history, next], rubricDraft: null });
    setDraft(structuredClone(next));
    setNote("");
    setSaving(false);
    toast(`Rubric v${next.version} approved — decisions re-run`);
  }

  return (
    <>
      <p className="eyebrow muted">Decision gate · team decides</p>
      <h1 className="h-page" style={{ marginTop: 8 }}>
        Rubric v{rubric.version}
      </h1>
      <p className="lede" style={{ marginTop: 10 }}>
        The two rubrics the expansion team supplied, as weights. Change a number, preview who moves, then approve a new version — the next upload reads it automatically.
      </p>
      {draftState && draftState.why.length > 0 && (
        <div className="notice blue" style={{ marginTop: 20 }}>
          <b>Proposal from the pattern finder</b>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {draftState.why.map((w) => (
              <li key={w} className="small">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid g2" style={{ marginTop: 28 }}>
        <div className="card white">
          <div className="spread">
            <p className="eyebrow">Partner rubric</p>
            <span className={`tag ${Math.round(sumP) === 100 ? "green" : "red"}`}>{sumP} / 100</span>
          </div>
          {(Object.keys(draft.partner) as (keyof Rubric["partner"])[]).map((k) => (
            <div key={k} className="spread" style={{ marginTop: 10 }}>
              <span className="small">{PARTNER_LABELS[k]}</span>
              <input className="input" style={{ width: 90 }} type="number" value={draft.partner[k]} onChange={(e) => setDraft({ ...draft, partner: { ...draft.partner, [k]: num(e.target.value) } })} />
            </div>
          ))}
        </div>
        <div className="card white">
          <div className="spread">
            <p className="eyebrow">Location rubric</p>
            <span className={`tag ${Math.round(sumL) === 100 ? "green" : "red"}`}>{sumL} / 100</span>
          </div>
          {(Object.keys(draft.location) as (keyof Rubric["location"])[]).map((k) => (
            <div key={k} className="spread" style={{ marginTop: 10 }}>
              <span className="small">{LOCATION_LABELS[k]}</span>
              <input className="input" style={{ width: 90 }} type="number" value={draft.location[k]} onChange={(e) => setDraft({ ...draft, location: { ...draft.location, [k]: num(e.target.value) } })} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid g2" style={{ marginTop: 18 }}>
        <div className="card white">
          <p className="eyebrow">Blend and lines</p>
          <div className="spread" style={{ marginTop: 10 }}>
            <span className="small">Partner share of the 100 points</span>
            <input className="input" style={{ width: 90 }} type="number" value={draft.blend.partner} onChange={(e) => setDraft({ ...draft, blend: { partner: num(e.target.value), location: 100 - num(e.target.value) } })} />
          </div>
          <div className="spread" style={{ marginTop: 10 }}>
            <span className="small">Conditional / slot-eligible from</span>
            <input className="input" style={{ width: 90 }} type="number" value={draft.conditionalMin} onChange={(e) => setDraft({ ...draft, conditionalMin: num(e.target.value) })} />
          </div>
          <div className="spread" style={{ marginTop: 10 }}>
            <span className="small">Reject below</span>
            <input className="input" style={{ width: 90 }} type="number" value={draft.rejectBelow} onChange={(e) => setDraft({ ...draft, rejectBelow: num(e.target.value) })} />
          </div>
          <div className="spread" style={{ marginTop: 10 }}>
            <span className="small">Auto-reject if capital is under (% of setup cost)</span>
            <input className="input" style={{ width: 90 }} type="number" value={Math.round(draft.capitalFloor * 100)} onChange={(e) => setDraft({ ...draft, capitalFloor: num(e.target.value) / 100 })} />
          </div>
          <div className="spread" style={{ marginTop: 10 }}>
            <span className="small">Own store closer than (km) = cannibalisation</span>
            <input className="input" style={{ width: 90 }} type="number" value={draft.saturationKm} onChange={(e) => setDraft({ ...draft, saturationKm: num(e.target.value) })} />
          </div>
        </div>
        <div className="card white">
          <p className="eyebrow">Tier minimums for Approve</p>
          {(["Tier 1", "Tier 2", "Tier 3"] as Tier[]).map((t) => (
            <div key={t} className="spread" style={{ marginTop: 10 }}>
              <span className="small">{t}</span>
              <input className="input" style={{ width: 90 }} type="number" value={draft.approveMin[t]} onChange={(e) => setDraft({ ...draft, approveMin: { ...draft.approveMin, [t]: num(e.target.value) } })} />
            </div>
          ))}
          <p className="xs muted" style={{ marginTop: 12 }}>
            A slot-holder below its tier minimum is approved conditionally, with a 90-day review.
          </p>
        </div>
      </div>

      <h3 className="section-h">Impact before approving</h3>
      <div className="card">
        {bad ? <p className="small" style={{ color: "var(--reject)" }}>{bad}</p> : !changed ? <p className="small muted">Edit a number to see which partners would move.</p> : <DiffList rows={diff} empty="No decision would change." />}
        {changed && !bad && movers.length > 0 && (
          <p className="small muted" style={{ marginTop: 12 }}>
            {movers.length} score{movers.length === 1 ? "" : "s"} move. Biggest: {movers.slice(0, 4).map((m) => `${m.id} ${m.from} → ${m.to}`).join(" · ")}.
          </p>
        )}
        <div className="row wrap" style={{ marginTop: 18 }}>
          <input className="input" style={{ maxWidth: 380 }} placeholder="Why this change? (saved with the version)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Btn variant="red" disabled={!changed || !!bad || saving} onClick={approve}>
            Approve as v{rubric.version + 1}
          </Btn>
          {changed && (
            <button
              className="linkbtn small"
              onClick={() => {
                setDraft(structuredClone(rubric));
                set({ rubricDraft: null });
              }}
            >
              Discard
            </button>
          )}
        </div>
      </div>

      <h3 className="section-h">Versions</h3>
      <div className="card white">
        <table className="table">
          <tbody>
            {[...history].reverse().map((h) => (
              <tr key={h.version + h.createdAt}>
                <td style={{ width: 70 }}>
                  <b>v{h.version}</b>
                </td>
                <td className="small muted" style={{ width: 170 }}>
                  {new Date(h.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                </td>
                <td className="small">{h.note}</td>
                <td style={{ textAlign: "right" }}>
                  {h.version !== rubric.version && (
                    <button className="linkbtn small" onClick={() => setDraft(structuredClone(h))}>
                      Load as draft
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
