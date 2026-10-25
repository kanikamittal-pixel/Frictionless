"use client";
import { useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { INDUSTRIES, MODELS, buildProfile, sanitizeProfile } from "@/lib/engine/brand";
import { aiProfile } from "@/lib/ai";
import type { BrandProfile, Tier } from "@/lib/engine/types";
import { Btn, Icon } from "./ui";
import KarnatakaMap from "./KarnatakaMap";
import Terrain from "./Terrain";
import { CITIES, EXISTING_STORES, ROAD_FACTOR, km } from "@/lib/engine/reference";

export default function Setup({ onFile, aiOn, resume, onResume, onScoring }: { onFile: (buf: ArrayBuffer, name: string) => void; aiOn: boolean; resume?: { file: string; count: number; at: string } | null; onResume?: () => void; onScoring?: () => void }) {
  const setup = useStore((s) => s.setup);
  const brand = useStore((s) => s.brand);
  const set = useStore((s) => s.set);
  const setSetup = useStore((s) => s.setSetup);
  const [drag, setDrag] = useState(false);
  const [tune, setTune] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const otherInd = setup.industryKey === "other";
  const otherMod = setup.modelKey === "other";

  const choose = (patch: Partial<typeof setup>) => {
    const next = { ...setup, ...patch };
    setSetup(patch);
    if (next.industryKey !== "other" && next.modelKey !== "other") set({ brand: buildProfile(next.industryKey, next.modelKey) });
  };

  async function buildCustom() {
    setBusy(true);
    setErr(null);
    const ind = otherInd ? setup.customIndustry : INDUSTRIES.find((i) => i.key === setup.industryKey)!.label;
    const mod = otherMod ? setup.customModel : MODELS.find((m) => m.key === setup.modelKey)!.label;
    try {
      if (!aiOn) throw new Error("AI off");
      const r = await aiProfile(ind, mod);
      set({ brand: r.profile });
    } catch {
      set({ brand: buildProfile(otherInd ? "eyewear" : setup.industryKey, otherMod ? "fofo" : setup.modelKey, ind, mod) });
      setErr("Couldn't reach the AI, so the closest preset was used — check the numbers below.");
    }
    setSetup({ builtFor: `${setup.industryKey}|${setup.modelKey}|${setup.customIndustry}|${setup.customModel}` });
    setBusy(false);
    setTune(true);
  }

  const read = (f: File) => f.arrayBuffer().then((b) => onFile(b, f.name));
  const sample = async () => {
    const r = await fetch("/sample/Outpost_Sample_Batch.xlsx");
    onFile(await r.arrayBuffer(), "Outpost_Sample_Batch.xlsx");
  };
  const customKey = `${setup.industryKey}|${setup.modelKey}|${setup.customIndustry}|${setup.customModel}`;
  const needsBuild = (otherInd || otherMod) && setup.builtFor !== customKey;
  const ready = !needsBuild && (!otherInd || setup.customIndustry.trim()) && (!otherMod || setup.customModel.trim());

  return (
    <>
      <Terrain className="hero-band">
        <div className="setup" style={{ paddingBottom: 56 }}>
      <div className="metarow eyebrow muted">
        <span>Outpost · Franchise partner engine</span>
        <span>Base · Karnataka · 7 cities · 10 stores</span>
        <span>Taking new batches</span>
      </div>

      {resume && (
        <div className="resume fade-in">
          <span className="eyebrow">
            <span style={{ color: "var(--accent)" }}>●</span> Batch in progress · {resume.file} · {resume.count} applications
          </span>
          <Btn small onClick={onResume}>
            Resume analysis
          </Btn>
        </div>
      )}

      <div className="hero-wrap">
        <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
          <div className="annot" style={{ inset: "-10px -14px -6px -10px" }}>
            <div className="annot-label">H1.DECISION · ONE STORE PER PIN</div>
          </div>
        <h1 className="h-hero" style={{ position: "relative" }}>
          Every franchise
          <br />
          application, decided<span style={{ color: "var(--accent)" }}>.</span>
          <span className="caret" />
        </h1>
        </div>
      </div>
      <div className="row wrap eyebrow muted" style={{ gap: 26 }}>
        <span>
          <span style={{ color: "var(--ink)" }}>●</span> Rules · deterministic · same file, same answer
        </span>
        <span>
          <span style={{ color: "var(--accent)" }}>◆</span> AI · reads the messy text, explains · never scores
        </span>
        <span>
          <span style={{ color: "var(--accent)" }}>▲</span> Terrain · point anywhere to raise the ground
        </span>
      </div>

      <div className="spread" style={{ marginTop: 34, paddingTop: 22, borderTop: "1px solid var(--line)", alignItems: "flex-end", flexWrap: "wrap", gap: 24 }}>
        <p className="lede" style={{ maxWidth: 560 }}>
          Upload the two sheets. Every partner gets a decision, a reason and an onboarding plan — then ask why, or tell it what changed.
        </p>
        <div className="row wrap">
          <Btn onClick={sample} disabled={!ready}>
            Run the sample batch
          </Btn>
          <button className="btn ghost" style={{ background: "var(--bg)" }} onClick={onScoring}>
            How partners are scored
          </button>
        </div>
      </div>
        </div>
      </Terrain>
    <div className="setup" style={{ paddingTop: 0 }}>
      <h3 className="section-h">
        <span>Set up</span>
        <span className="meta">Three steps · ~30 sec</span>
      </h3>
      <div className="setup-steps">
        <div className="srow">
          <span className="idx">01</span>
          <div>
            <h3>Brand</h3>
            <p className="small muted" style={{ marginTop: 10 }}>
              What the brand sells sets the store size, the money a partner needs and what counts as relevant experience.
            </p>
          </div>
          <div>
            <div className="chips">
              {INDUSTRIES.map((i) => (
                <button key={i.key} className={`chip${setup.industryKey === i.key ? " on" : ""}`} onClick={() => choose({ industryKey: i.key })} title={i.hint}>
                  {i.label}
                </button>
              ))}
              <button className={`chip${otherInd ? " on" : ""}`} onClick={() => choose({ industryKey: "other" })}>
                Other…
              </button>
            </div>
            {otherInd && <input className="input" style={{ marginTop: 12 }} placeholder="e.g. Premium tea and snacks kiosks" value={setup.customIndustry} onChange={(e) => setSetup({ customIndustry: e.target.value })} />}
          </div>
        </div>

        <div className="srow">
          <span className="idx">02</span>
          <div>
            <h3>Model</h3>
            <p className="small muted" style={{ marginTop: 10 }}>
              {otherMod ? "Describe how partners invest and who runs the store." : MODELS.find((m) => m.key === setup.modelKey)?.hint}
            </p>
          </div>
          <div>
            <div className="chips">
              {MODELS.map((m) => (
                <button key={m.key} className={`chip${setup.modelKey === m.key ? " on" : ""}`} onClick={() => choose({ modelKey: m.key })} title={m.hint}>
                  {m.label}
                </button>
              ))}
              <button className={`chip${otherMod ? " on" : ""}`} onClick={() => choose({ modelKey: "other" })}>
                Other…
              </button>
            </div>
            {otherMod && <input className="input" style={{ marginTop: 12 }} placeholder="e.g. Master franchise for a district, partner opens 3 stores" value={setup.customModel} onChange={(e) => setSetup({ customModel: e.target.value })} />}
            {(otherInd || otherMod) && (
              <div style={{ marginTop: 14 }}>
                <Btn small onClick={buildCustom} disabled={busy || (otherInd && !setup.customIndustry.trim()) || (otherMod && !setup.customModel.trim())}>
                  {busy ? "Building profile…" : "Build brand profile"}
                </Btn>
              </div>
            )}
            {err && <p className="small note-red" style={{ marginTop: 10 }}>{err}</p>}
            {!needsBuild && (
              <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px dashed var(--line-strong)" }}>
                <div className="spread">
                  <span className="eyebrow muted">What this sets</span>
                  <button className="linkbtn small" onClick={() => setTune(!tune)}>
                    {tune ? "Done" : "Tune numbers"}
                  </button>
                </div>
                <p className="small" style={{ marginTop: 8 }}>{brand.summary}</p>
                {tune && <Tune brand={brand} onChange={(b) => set({ brand: sanitizeProfile(b) })} />}
              </div>
            )}
          </div>
        </div>

        <div className="srow">
          <span className="idx">03</span>
          <div>
            <h3>Upload</h3>
            <p className="small muted" style={{ marginTop: 10 }}>
              Sheet 1 Applications and Sheet 2 Territories. Sheet 3 (existing stores) is built in. Read in your browser.{" "}
              <a className="linkbtn" href="/sample/Outpost_Sample_Batch.xlsx" download>
                Download the sample
              </a>
            </p>
          </div>
          <div
            className={`dropzone${drag ? " drag" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files[0];
              if (f && ready) read(f);
            }}
          >
            <button className="round" style={{ width: 54, height: 54 }} onClick={() => ready && fileRef.current?.click()} disabled={!ready} aria-label="Choose an Excel file">
              <Icon name="up" />
            </button>
            <div>
              <p style={{ fontSize: 18, letterSpacing: "-0.02em" }}>{ready ? "Drop the .xlsx here, or choose a file" : "Finish the brand profile first"}</p>
              <p className="eyebrow muted" style={{ marginTop: 6 }}>
                .xlsx · .xls · .csv · messy cells welcome
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.xlsm,.csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) read(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      </div>

      <h3 className="section-h">
        <span>Terrain</span>
        <span className="meta">Fig. 01 · stores and supply routes from the Bengaluru hub</span>
      </h3>
      <div className="mapfig mapgrid">
        <KarnatakaMap wide />
        <div className="readout">
          <p className="eyebrow muted">Readout</p>
          <table className="table" style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th>City</th>
                <th>Tier</th>
                <th>Pins</th>
                <th>Stores</th>
                <th>From hub</th>
              </tr>
            </thead>
            <tbody>
              {CITIES.map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td className="num">{c.tier.replace("Tier ", "T")}</td>
                  <td className="num">{c.prefix}xxx</td>
                  <td className="num">{EXISTING_STORES.filter((x) => x.city === c.name).length || "—"}</td>
                  <td className="num">{c.name === "Bengaluru" ? "hub" : `~${Math.round(km(CITIES[0], c) * ROAD_FACTOR)} km`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="eyebrow muted" style={{ marginTop: 14 }}>
            Rule · never two stores in one pin
          </p>
        </div>
      </div>
    </div>
    </>
  );
}

function Tune({ brand, onChange }: { brand: BrandProfile; onChange: (b: BrandProfile) => void }) {
  const num = (v: string) => (v === "" ? 0 : Number(v));
  const tiers: Tier[] = ["Tier 1", "Tier 2", "Tier 3"];
  return (
    <div className="grid g3" style={{ marginTop: 16 }}>
      <div className="field">
        <label>Ideal size min (sq ft)</label>
        <input className="input" type="number" value={brand.sqft.idealMin} onChange={(e) => onChange({ ...brand, sqft: { ...brand.sqft, idealMin: num(e.target.value) } })} />
      </div>
      <div className="field">
        <label>Ideal size max (sq ft)</label>
        <input className="input" type="number" value={brand.sqft.idealMax} onChange={(e) => onChange({ ...brand, sqft: { ...brand.sqft, idealMax: num(e.target.value) } })} />
      </div>
      <div className="field">
        <label>Staff per store</label>
        <input className="input" type="number" value={brand.staff} onChange={(e) => onChange({ ...brand, staff: num(e.target.value) })} />
      </div>
      {tiers.map((t) => (
        <div className="field" key={t}>
          <label>Setup cost {t} (₹ lakh)</label>
          <input className="input" type="number" value={brand.capexLakh[t]} onChange={(e) => onChange({ ...brand, capexLakh: { ...brand.capexLakh, [t]: num(e.target.value) } })} />
        </div>
      ))}
      <div className="field">
        <label>Walk-in dependence</label>
        <select className="input" value={brand.footfall} onChange={(e) => onChange({ ...brand, footfall: e.target.value as BrandProfile["footfall"] })}>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low (e.g. delivery hub)</option>
        </select>
      </div>
      <div className="field">
        <label>Ground floor required</label>
        <select className="input" value={brand.groundCritical ? "y" : "n"} onChange={(e) => onChange({ ...brand, groundCritical: e.target.value === "y" })}>
          <option value="y">Yes</option>
          <option value="n">No</option>
        </select>
      </div>
      <div className="field">
        <label>Who runs the store</label>
        <select className="input" value={brand.partnerOperates ? "p" : "b"} onChange={(e) => onChange({ ...brand, partnerOperates: e.target.value === "p" })}>
          <option value="p">Partner</option>
          <option value="b">Brand</option>
        </select>
      </div>
    </div>
  );
}
