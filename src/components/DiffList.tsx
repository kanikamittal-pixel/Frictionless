"use client";
import type { DiffRow } from "@/lib/engine/patch";
import { useStore } from "@/lib/store";
import { Icon, Pill } from "./ui";

export default function DiffList({ rows, dark, empty = "No decision changes." }: { rows: DiffRow[]; dark?: boolean; empty?: string }) {
  const open = useStore((s) => s.open);
  if (!rows.length) return <p className={dark ? "xs" : "small muted"} style={dark ? { opacity: 0.7 } : undefined}>{empty}</p>;
  return (
    <div className="stack" style={{ marginTop: 8 }}>
      {rows.map((r) => (
        <div key={r.id} style={{ fontSize: 13 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className={dark ? "idlink" : "linkbtn"} onClick={() => open(r.id)} style={{ fontWeight: 600 }}>
              {r.id}
            </button>
            {r.from ? <Pill d={r.from} /> : <span className="tag">new</span>}
            <Icon name="arrow" size={14} />
            {r.to && /^Withdrawn/.test(r.why) ? <span className="pill plain">Withdrawn</span> : r.to ? <Pill d={r.to} /> : <span className="tag">removed</span>}
            {r.scoreFrom !== null && r.scoreTo !== null && Math.abs(r.scoreFrom - r.scoreTo) >= 0.1 && (
              <span className="mono xs" style={{ opacity: 0.75 }}>
                {r.scoreFrom} → {r.scoreTo}
              </span>
            )}
            {r.from === "Reject" && r.to && r.to !== "Reject" && <span className="tag amber">team to confirm</span>}
            {!r.direct && <span className="tag" style={dark ? { background: "rgba(255,255,255,.08)", color: "#ddd" } : undefined}>knock-on</span>}
          </div>
          <p className="xs" style={{ opacity: dark ? 0.75 : 0.7, marginTop: 2 }}>
            {r.why}
          </p>
        </div>
      ))}
    </div>
  );
}
