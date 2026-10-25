"use client";
import { useMemo, useState } from "react";
import type { Application } from "@/lib/engine/types";
import type { Edit } from "@/lib/engine/patch";
import { checkEdits, commitEdits, currentInput, previewEdits } from "@/lib/actions";
import { CITIES } from "@/lib/engine/reference";
import { Btn } from "./ui";
import DiffList from "./DiffList";

// Edit an application's fields (or add a new one), preview exactly which
// decisions change — including knock-on effects on rivals — then apply.

type F = Record<string, string>;

const toForm = (a?: Application): F => ({
  name: a?.name ?? "",
  city: a?.city ?? "",
  pin: a?.pin ?? "",
  investment: a?.investment?.toString() ?? "",
  experience: a?.experience?.toString() ?? "",
  business: a?.business ?? "",
  space: a?.space ?? "",
  size: a?.size?.toString() ?? "",
  floor: a?.floor ?? "Not known",
  launch: a?.launch?.toString() ?? "",
  language: a?.language ?? "",
  notes: a?.notes ?? "",
});

export default function AppForm({ app, onClose, onDone }: { app?: Application; onClose: () => void; onDone: (id: string) => void }) {
  const initial = useMemo(() => toForm(app), [app]);
  const [f, setF] = useState<F>(initial);
  const [note, setNote] = useState("");
  const newId = useMemo(() => {
    const ids = currentInput()?.applications.map((a) => +(a.id.match(/APP-(\d+)/)?.[1] ?? 0)) ?? [0];
    return `APP-${String(Math.max(0, ...ids) + 1).padStart(3, "0")}`;
  }, []);

  const edits: Edit[] = useMemo(() => {
    if (!app) {
      const v: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(f)) if (val !== "") v[k] = val;
      return [{ entity: "application", id: newId, field: "*", value: v }];
    }
    return Object.keys(f)
      .filter((k) => f[k] !== initial[k])
      .map((k) => ({ entity: "application" as const, id: app.id, field: k, value: f[k] === "" ? null : f[k] }));
  }, [f, initial, app, newId]);

  const check = useMemo(() => (app ? checkEdits(edits) : { ok: edits, errors: [], lines: [`New application ${newId}`] }), [edits, app, newId]);
  const diff = useMemo(() => (check.ok.length ? previewEdits(check.ok) : []), [check]);
  const up = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const apply = () => {
    commitEdits(check.ok, note.trim() || (app ? `Edited ${app.id} in the form` : `Added ${newId}`), "form");
    onDone(app?.id ?? newId);
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: "min(760px, 100%)" }}>
        <p className="eyebrow muted">{app ? "New information" : "Add an application"}</p>
        <h2 style={{ fontSize: 28, marginTop: 6 }}>{app ? `${app.id} · ${app.name}` : newId}</h2>
        <div className="grid g3" style={{ marginTop: 20 }}>
          <div className="field">
            <label>Applicant name</label>
            <input className="input" value={f.name} onChange={up("name")} />
          </div>
          <div className="field">
            <label>City</label>
            <select className="input" value={f.city} onChange={up("city")}>
              <option value="">—</option>
              {CITIES.map((c) => (
                <option key={c.name}>{c.name}</option>
              ))}
              {f.city && !CITIES.some((c) => c.name === f.city) && <option>{f.city}</option>}
            </select>
          </div>
          <div className="field">
            <label>Pin code</label>
            <input className="input" value={f.pin} onChange={up("pin")} inputMode="numeric" />
          </div>
          <div className="field">
            <label>Investment (₹ lakh)</label>
            <input className="input" value={f.investment} onChange={up("investment")} />
          </div>
          <div className="field">
            <label>Retail experience (yrs)</label>
            <input className="input" value={f.experience} onChange={up("experience")} />
          </div>
          <div className="field">
            <label>Target launch (months)</label>
            <input className="input" value={f.launch} onChange={up("launch")} />
          </div>
          <div className="field">
            <label>Space available</label>
            <select className="input" value={f.space} onChange={up("space")}>
              <option value="">—</option>
              <option>Owned</option>
              <option>Rented</option>
              <option>Not yet identified</option>
            </select>
          </div>
          <div className="field">
            <label>Space size (sq ft)</label>
            <input className="input" value={f.size} onChange={up("size")} />
          </div>
          <div className="field">
            <label>Floor</label>
            <select className="input" value={f.floor} onChange={up("floor")}>
              <option>Ground</option>
              <option>Upper</option>
              <option>Mall unit</option>
              <option>Not known</option>
            </select>
          </div>
          <div className="field">
            <label>Preferred language</label>
            <select className="input" value={f.language} onChange={up("language")}>
              <option value="">—</option>
              <option>Kannada</option>
              <option>English</option>
              <option>Hindi</option>
            </select>
          </div>
          <div className="field" style={{ gridColumn: "span 2" }}>
            <label>Current / past business</label>
            <input className="input" value={f.business} onChange={up("business")} />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Notes from applicant</label>
            <textarea className="input" rows={2} value={f.notes} onChange={up("notes")} />
          </div>
          {app && (
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Where did this come from? (for the change log)</label>
              <input className="input" placeholder="e.g. Call with the applicant on 25 Oct" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          )}
        </div>

        <div className="card" style={{ marginTop: 20 }}>
          <p className="eyebrow">Impact preview</p>
          {check.errors.map((e) => (
            <p key={e} className="small" style={{ color: "var(--reject)", marginTop: 6 }}>
              {e}
            </p>
          ))}
          {check.lines.length ? (
            <ul className="small" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {check.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          ) : (
            <p className="small muted" style={{ marginTop: 6 }}>
              Change a field to see what happens.
            </p>
          )}
          {check.ok.length > 0 && <DiffList rows={diff} empty="No decision changes — scores or details only." />}
        </div>
        <div className="row" style={{ marginTop: 20, justifyContent: "flex-end" }}>
          <button className="btn ghost plain" onClick={onClose}>
            Cancel
          </button>
          <Btn variant="red" onClick={apply} disabled={!check.ok.length}>
            Apply and re-decide
          </Btn>
        </div>
      </div>
    </div>
  );
}
