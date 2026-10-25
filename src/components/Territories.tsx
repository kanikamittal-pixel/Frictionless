"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useEngine } from "@/lib/useEngine";
import { checkEdits, commitEdits, previewEdits } from "@/lib/actions";
import type { Edit } from "@/lib/engine/patch";
import type { TerritoryResult } from "@/lib/engine/types";
import { GAZETTEER } from "@/lib/engine/reference";
import { Btn, Pill } from "./ui";
import DiffList from "./DiffList";

export default function Territories({ toast }: { toast: (s: string) => void }) {
  const { out } = useEngine();
  const open = useStore((s) => s.open);
  const localities = useStore((s) => s.localities);
  const [edit, setEdit] = useState<TerritoryResult | null>(null);
  if (!out) return null;
  const byId = new Map(out.results.map((r) => [r.id, r]));
  const outside = out.results.filter((r) => r.gate === "fail" || r.gate === "fallback");

  return (
    <>
      <h1 className="h-page">Territories</h1>
      <p className="lede" style={{ marginTop: 10 }}>
        One store per pin. Usable slots are capped by pins that already have a store.
      </p>
      <div className="row wrap xs" style={{ marginTop: 16, gap: 10 }}>
        <span className="pinchip store">ST · existing store</span>
        <span className="pinchip won">approved</span>
        <span className="pinchip cond">conditional</span>
        <span className="pinchip">free pin</span>
      </div>

      <div className="grid g2" style={{ marginTop: 28 }}>
        {out.territories.map((t) => {
          const pinState = (p: string) => {
            const st = t.blockedPins.find((b) => b.pin === p);
            if (st) return { cls: "store", label: `${p} · ${st.store}` };
            const w = t.allocated.map((id) => byId.get(id)!).find((r) => r?.app.pin === p);
            if (w) return { cls: w.decision === "Approve" ? "won" : "cond", label: `${p} · ${w.id}` };
            return { cls: "", label: p };
          };
          return (
            <div key={t.id} className="card white">
              <div className="spread">
                <div>
                  <p className="eyebrow muted">
                    {t.tier ?? "—"} · {t.territory.priority ?? "Medium"} priority
                  </p>
                  <h3 style={{ fontSize: 22, marginTop: 4 }}>
                    {t.id} · {t.territory.city}
                  </h3>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="slots" style={{ justifyContent: "flex-end" }}>
                    {Array.from({ length: t.capacity }).map((_, i) => (
                      <i key={i} className={i < t.allocated.length ? "full" : ""} />
                    ))}
                  </div>
                  <p className="xs faint" style={{ marginTop: 4 }}>
                    {t.allocated.length} of {t.capacity} filled
                  </p>
                </div>
              </div>
              <div className="pins" style={{ marginTop: 14 }}>
                {t.territory.pins.map((p) => {
                  const s = pinState(p);
                  const loc = GAZETTEER[p] ?? localities[p];
                  return (
                    <span key={p} className={`pinchip ${s.cls}`} title={loc ? `${loc.name}${loc.confidence === "ai" ? " (AI estimate)" : ""}` : undefined}>
                      {s.label}
                    </span>
                  );
                })}
              </div>
              <p className="small muted" style={{ marginTop: 14 }}>
                {t.note}
              </p>
              {t.applicants.length > 0 && (
                <details style={{ marginTop: 12 }}>
                  <summary className="small" style={{ cursor: "pointer", fontWeight: 600 }}>
                    {t.applicants.length} applicant{t.applicants.length === 1 ? "" : "s"}
                  </summary>
                <div className="stack" style={{ marginTop: 10 }}>
                  {t.applicants
                    .map((id) => byId.get(id)!)
                    .sort((a, b) => b.score - a.score)
                    .map((r) => (
                      <button key={r.id} className="spread small" style={{ border: 0, background: "none", padding: 0, width: "100%", textAlign: "left" }} onClick={() => open(r.id)}>
                        <span>
                          <b>{r.id}</b> {r.app.name} <span className="faint">· {r.app.pin} · {r.score}</span>
                        </span>
                        <Pill d={r.decision} />
                      </button>
                    ))}
                </div>
                </details>
              )}
              {t.issues.filter((i) => i.severity !== "info").length > 0 && (
                <div className="xs" style={{ marginTop: 12, color: "var(--conditional)" }}>
                  {t.issues
                    .filter((i) => i.severity !== "info")
                    .map((i) => i.message)
                    .join(" ")}
                </div>
              )}
              <div style={{ marginTop: 16 }}>
                <button className="linkbtn small" onClick={() => setEdit(t)}>
                  Change slots, priority or pins
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {outside.length > 0 && (
        <>
          <h3 className="section-h">Asked for pins outside the plan</h3>
          <div className="card white">
            <p className="small muted">The cheapest signal of where to grow next.</p>
            <div className="stack" style={{ marginTop: 12 }}>
              {outside.map((r) => (
                <button key={r.id} className="spread small" style={{ border: 0, background: "none", padding: 0, width: "100%", textAlign: "left" }} onClick={() => open(r.id)}>
                  <span>
                    <b>{r.id}</b> {r.app.name} · {r.app.city} {r.app.pin} · score {r.score}
                  </span>
                  <Pill d={r.decision} />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {edit && <TerritoryForm t={edit} onClose={() => setEdit(null)} toast={toast} />}
    </>
  );
}

function TerritoryForm({ t, onClose, toast }: { t: TerritoryResult; onClose: () => void; toast: (s: string) => void }) {
  const [slots, setSlots] = useState(String(t.territory.slots ?? 0));
  const [priority, setPriority] = useState(t.territory.priority ?? "Medium");
  const [pins, setPins] = useState(t.territory.pins.join(", "));
  const edits = useMemo(() => {
    const e: Edit[] = [];
    if (slots !== String(t.territory.slots ?? 0)) e.push({ entity: "territory", id: t.id, field: "slots", value: slots });
    if (priority !== (t.territory.priority ?? "Medium")) e.push({ entity: "territory", id: t.id, field: "priority", value: priority });
    if (pins.replace(/\s/g, "") !== t.territory.pins.join(",")) e.push({ entity: "territory", id: t.id, field: "pins", value: pins });
    return e;
  }, [slots, priority, pins, t]);
  const chk = useMemo(() => checkEdits(edits), [edits]);
  const diff = useMemo(() => (chk.ok.length ? previewEdits(chk.ok) : []), [chk]);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow muted">Territory</p>
        <h2 style={{ fontSize: 28, marginTop: 6 }}>
          {t.id} · {t.territory.city}
        </h2>
        <div className="grid g2" style={{ marginTop: 18 }}>
          <div className="field">
            <label>Open slots</label>
            <input className="input" type="number" min={0} value={slots} onChange={(e) => setSlots(e.target.value)} />
          </div>
          <div className="field">
            <label>Priority</label>
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Pin codes covered</label>
            <textarea className="input" rows={2} value={pins} onChange={(e) => setPins(e.target.value)} />
          </div>
        </div>
        <div className="card" style={{ marginTop: 18 }}>
          <p className="eyebrow">Impact preview</p>
          {chk.errors.map((e) => (
            <p key={e} className="small" style={{ color: "var(--reject)" }}>
              {e}
            </p>
          ))}
          {chk.ok.length ? <DiffList rows={diff} /> : <p className="small muted">Change something to see who moves.</p>}
        </div>
        <div className="row" style={{ marginTop: 18, justifyContent: "flex-end" }}>
          <button className="btn ghost plain" onClick={onClose}>
            Cancel
          </button>
          <Btn
            variant="red"
            disabled={!chk.ok.length}
            onClick={() => {
              commitEdits(chk.ok, `Edited ${t.id}: ${chk.lines.join("; ")}`, "form");
              toast("Territory updated — decisions re-run");
              onClose();
            }}
          >
            Apply
          </Btn>
        </div>
      </div>
    </div>
  );
}
