"use client";
import { Fragment, useMemo } from "react";
import { useStore } from "@/lib/store";
import { useEngine } from "@/lib/useEngine";
import { simpleRows } from "@/lib/criteria";
import { Icon } from "./ui";

// Left panel inside an analysis (toggled by the header's Criteria button):
// the plain-language scoring, with the open partner's own marks beside it.

const AREAS = ["Money", "Site", "Operator", "Location", "Launch"];
const DIM_KEY: Record<string, string> = { Money: "money", Site: "site", Operator: "operator", Location: "location", Launch: "launch" };

export default function CriteriaPanel() {
  const open = useStore((s) => s.criteriaOpen);
  const set = useStore((s) => s.set);
  const rubric = useStore((s) => s.rubric);
  const brand = useStore((s) => s.brand);
  const selected = useStore((s) => s.selected);
  const tab = useStore((s) => s.tab);
  const { out } = useEngine();
  const rows = useMemo(() => simpleRows(rubric, brand), [rubric, brand]);
  const r = tab === "decisions" && selected ? out?.results.find((x) => x.id === selected) : undefined;
  if (!open) return null;

  return (
    <aside className="crit" aria-label="Scoring criteria">
      <div className="crit-head">
        <div>
          <p className="eyebrow muted">Out of 100 · rubric v{rubric.version}</p>
          <h4 style={{ marginTop: 4 }}>How partners are scored</h4>
        </div>
        <button className="iconbtn" onClick={() => set({ criteriaOpen: false })} aria-label="Close the criteria panel" title="Close">
          <Icon name="x" size={14} />
        </button>
      </div>
      <div className="crit-body">
        {r && (
          <div className="crit-who">
            <span className="eyebrow muted">Marks for</span>
            <b>
              {r.id} · {r.app.name || "Unnamed"}
            </b>
            <span className="mono small">{Math.round(r.score)}/100</span>
          </div>
        )}
        {AREAS.map((a) => {
          const list = rows.filter((x) => x.area === a);
          const pts = +list.reduce((s, x) => s + x.points, 0).toFixed(1);
          const dim = r?.dimensions.find((d) => d.key === DIM_KEY[a]);
          return (
            <Fragment key={a}>
              <div className="cp-area">
                <b>{a}</b>
                <span className="mono xs muted">
                  {pts} pts{dim ? <span style={{ color: "var(--accent-text)" }}> · {dim.score}/100</span> : null}
                </span>
              </div>
              {list.map((x) => {
                const f = r?.factors.find((y) => y.key === x.key);
                return (
                  <div key={x.key} className="cp-row">
                    <div className="spread" style={{ alignItems: "baseline" }}>
                      <span className="small">{x.what}</span>
                      <span className="mono xs">{f ? <span style={{ color: "var(--accent-text)" }}>{f.score}/10</span> : `${x.points} pts`}</span>
                    </div>
                    <p className="xs muted">
                      Full: {x.full}. Low: {x.low}.
                    </p>
                  </div>
                );
              })}
            </Fragment>
          );
        })}
        <p className="xs muted" style={{ marginTop: 18 }}>
          Approve needs a slot and Tier 1 {rubric.approveMin["Tier 1"]} · Tier 2 {rubric.approveMin["Tier 2"]} · Tier 3 {rubric.approveMin["Tier 3"]}. Below {rubric.rejectBelow} is a reject. One store per pin code.
        </p>
      </div>
    </aside>
  );
}
