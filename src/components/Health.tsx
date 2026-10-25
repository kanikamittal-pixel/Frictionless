"use client";
import { useStore } from "@/lib/store";
import { useEngine } from "@/lib/useEngine";
import type { Issue } from "@/lib/engine/types";


const SEV: Record<Issue["severity"], { label: string; cls: string; rank: number }> = {
  block: { label: "blocking", cls: "red", rank: 0 },
  warn: { label: "check", cls: "amber", rank: 1 },
  info: { label: "handled", cls: "", rank: 2 },
};

export default function Health() {
  const { out } = useEngine();
  const batch = useStore((s) => s.batch)!;
  const tags = useStore((s) => s.tags);
  const open = useStore((s) => s.open);
  if (!out) return null;
  const rows = out.results.flatMap((r) => r.issues.map((i) => ({ id: r.id, i }))).sort((a, b) => SEV[a.i.severity].rank - SEV[b.i.severity].rank || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const counts = { block: 0, warn: 0, info: 0 };
  for (const r of rows) counts[r.i.severity]++;
  const aiRead = Object.values(tags).filter((t) => t.source === "ai").length;

  return (
    <>
      <p className="eyebrow muted">Reads &amp; checks the file</p>
      <h1 className="h-page" style={{ marginTop: 8 }}>
        Data health
      </h1>
      <p className="lede" style={{ marginTop: 10 }}>
        Messy cells are read, not rejected. Blanks and contradictions put a partner on hold for one question instead of a wrong decision.
      </p>
      <div className="grid g4" style={{ marginTop: 28 }}>
        <div className="card kpi">
          <b>{out.results.length}</b>
          <span>rows read</span>
        </div>
        <div className="card kpi">
          <b style={{ color: "var(--reject)" }}>{counts.block}</b>
          <span>blocking</span>
        </div>
        <div className="card kpi">
          <b style={{ color: "var(--conditional)" }}>{counts.warn}</b>
          <span>to check</span>
        </div>
        <div className="card kpi">
          <b>{aiRead}</b>
          <span>free-text read by AI</span>
        </div>
      </div>

      <h3 className="section-h">How the file was read</h3>
      <div className="card white">
        <table className="table">
          <thead>
            <tr>
              <th>Sheet</th>
              <th>Read as</th>
              <th>Rows</th>
            </tr>
          </thead>
          <tbody>
            {batch.sheets.map((s) => (
              <tr key={s.name}>
                <td>{s.name}</td>
                <td>{s.kind === "ignored" ? <span className="faint">ignored (no data table)</span> : s.kind}</td>
                <td className="num">{s.rows}</td>
              </tr>
            ))}
            {batch.storesSource === "built-in" && (
              <tr>
                <td className="faint">—</td>
                <td>existing stores</td>
                <td className="small muted">Sheet 3 not in the file — used the fixed list of 10 stores</td>
              </tr>
            )}
          </tbody>
        </table>
        {[...batch.parseIssues, ...out.batchIssues].map((i, k) => (
          <div key={k} className={`notice ${i.severity === "block" ? "" : "amber"} small`} style={{ marginTop: 12 }}>
            {i.message}
          </div>
        ))}
      </div>

      <h3 className="section-h">Territory sheet</h3>
      <div className="card white">
        {out.territories.some((t) => t.issues.length) ? (
          <table className="table">
            <tbody>
              {out.territories.flatMap((t) =>
                t.issues.map((i, k) => (
                  <tr key={t.id + k}>
                    <td style={{ width: 110 }}>
                      <b>{t.id}</b>
                    </td>
                    <td style={{ width: 100 }}>
                      <span className={`tag ${SEV[i.severity].cls}`}>{SEV[i.severity].label}</span>
                    </td>
                    <td className="small">{i.message}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        ) : (
          <p className="small muted">No problems in the territories sheet.</p>
        )}
      </div>

      <h3 className="section-h">Applications sheet</h3>
      <div className="card white">
        {rows.length ? (
          <table className="table">
            <tbody>
              {rows.map(({ id, i }, k) => (
                <tr key={k}>
                  <td style={{ width: 110 }}>
                    <button className="linkbtn" onClick={() => open(id)}>
                      {id}
                    </button>
                  </td>
                  <td style={{ width: 100 }}>
                    <span className={`tag ${SEV[i.severity].cls}`}>{SEV[i.severity].label}</span>
                  </td>
                  <td className="small">{i.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="small muted">Every row is clean.</p>
        )}
      </div>
    </>
  );
}
