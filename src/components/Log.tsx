"use client";
import { useStore } from "@/lib/store";
import { Icon } from "./ui";
import DiffList from "./DiffList";

export default function Log() {
  const changes = useStore((s) => s.changes);
  const undo = useStore((s) => s.undoChange);
  const batch = useStore((s) => s.batch)!;
  const list = [...changes].reverse();
  return (
    <>
      <p className="eyebrow muted">Every update, with its effect</p>
      <h1 className="h-page" style={{ marginTop: 8 }}>
        Change log
      </h1>
      <p className="lede" style={{ marginTop: 10 }}>
        The uploaded file is never modified. Each change is stored on top of it, so any decision can be traced back to the exact information that produced it.
      </p>
      <div className="stack" style={{ marginTop: 28 }}>
        {list.map((c) => (
          <div key={c.id} className="card white">
            <div className="spread" style={{ flexWrap: "wrap" }}>
              <p className="eyebrow muted">
                {new Date(c.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · via {c.source}
              </p>
              {c.edits.length > 0 && (
                <button className="linkbtn small" onClick={() => undo(c.id)} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <Icon name="undo" size={14} /> Undo
                </button>
              )}
            </div>
            <p style={{ marginTop: 8, fontWeight: 600 }}>{c.message}</p>
            {c.edits.length > 0 && (
              <ul className="small muted" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {c.edits.map((e, i) => (
                  <li key={i}>
                    {e.id} · {e.field === "*" ? "new application" : e.field} → {typeof e.value === "object" ? "…" : String(e.value)}
                  </li>
                ))}
              </ul>
            )}
            <p className="eyebrow" style={{ marginTop: 14 }}>
              Effect at the time
            </p>
            <DiffList rows={c.impact} empty="No decision changed." />
          </div>
        ))}
        <div className="card">
          <p className="eyebrow muted">{new Date(batch.uploadedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · upload</p>
          <p style={{ marginTop: 8, fontWeight: 600 }}>
            {batch.fileName} — {batch.applications.length} applications, {batch.territories.length} territories
          </p>
        </div>
      </div>
    </>
  );
}
