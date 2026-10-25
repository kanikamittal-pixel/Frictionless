"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useEngine } from "@/lib/useEngine";
import type { Decision } from "@/lib/engine/types";
import { Pill, ScoreRing } from "./ui";
import Detail from "./Detail";
import AppForm from "./AppForm";

const ORDER: (Decision | "All")[] = ["All", "Approve", "Conditional", "Hold", "Reject"];

export default function Decisions({ toast }: { toast: (s: string) => void }) {
  const { out } = useEngine();
  const selected = useStore((s) => s.selected);
  const filter = useStore((s) => s.filter);
  const set = useStore((s) => s.set);
  const open = useStore((s) => s.open);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => {
    if (!out) return [];
    const ql = q.trim().toLowerCase();
    return out.results
      .filter((r) => filter === "All" || r.decision === filter)
      .filter((r) => !ql || `${r.id} ${r.app.name} ${r.app.city} ${r.app.pin} ${r.territoryId ?? ""} ${r.headline}`.toLowerCase().includes(ql))
      .sort((a, b) => b.score - a.score);
  }, [out, filter, q]);

  if (!out) return null;
  if (selected && out.results.some((r) => r.id === selected)) return <Detail id={selected} toast={toast} />;

  return (
    <>
      <div className="spread" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
        <h1 className="h-page">Partners</h1>
        <button className="linkbtn small" onClick={() => setAdding(true)}>
          + Add an application
        </button>
      </div>
      <div className="spread" style={{ marginTop: 22, flexWrap: "wrap" }}>
        <div className="chips">
          {ORDER.map((d) => (
            <button key={d} className={`chip${filter === d ? " on" : ""}`} onClick={() => set({ filter: d })}>
              {d === "Hold" ? "On hold" : d}
              <small>{d === "All" ? out.results.length : out.summary.counts[d]}</small>
            </button>
          ))}
        </div>
        <input className="search" placeholder="Search name, ID or pin" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="dlist" style={{ marginTop: 22 }}>
        {rows.map((r) => (
          <button key={r.id} className="drow" onClick={() => open(r.id)}>
            <ScoreRing score={r.score} decision={r.decision} />
            <div style={{ minWidth: 0 }}>
              <div className="who">
                <b>{r.id}</b>
                <span>{r.app.name || <i className="faint">no name</i>}</span>
                <span className="xs faint">
                  {r.app.city || "—"} {r.app.pin}
                </span>
                {r.override && <span className="tag amber">team override</span>}
                {r.app.withdrawn && <span className="tag">withdrawn</span>}
              </div>
              <p className="why">{r.headline}</p>
            </div>
            {r.app.withdrawn ? <span className="pill plain">Withdrawn</span> : <Pill d={r.decision} />}
          </button>
        ))}
        {!rows.length && <p className="muted">Nothing matches.</p>}
      </div>
      {adding && (
        <AppForm
          onClose={() => setAdding(false)}
          onDone={(id) => {
            setAdding(false);
            toast(`${id} added and decided`);
            open(id);
          }}
        />
      )}
    </>
  );
}
