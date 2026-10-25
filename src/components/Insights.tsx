"use client";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useEngine } from "@/lib/useEngine";
import { aiPatterns } from "@/lib/ai";
import { LOCATION_LABELS, PARTNER_LABELS } from "@/lib/engine/rubric";
import type { Decision, Rubric } from "@/lib/engine/types";
import { Btn, DCOLOR } from "./ui";
import { dimensions } from "@/lib/engine/dimensions";

const D: Decision[] = ["Approve", "Conditional", "Hold", "Reject"];
const LABELS: Record<string, string> = { ...PARTNER_LABELS, ...LOCATION_LABELS };

interface SavedResult {
  id: string;
  decision: Decision;
  score: number;
  city: string;
  headline: string;
  factors: { key: string; group: string; score: number }[];
  issues: string[];
}
interface SavedBatch {
  id: string;
  created_at: string;
  file_name: string;
  brand: { industry: string };
  rubric_version: number;
  summary: { total: number; counts: Record<Decision, number>; slotsOpen: number; slotsFilled: number };
  results: SavedResult[];
}
interface SavedOutcome {
  batch_id: string;
  app_id: string;
  opened: boolean;
  on_time: boolean;
  payback_months: number | null;
}

export function reasonOf(headline: string, decision: Decision): string {
  const h = headline.toLowerCase();
  if (decision === "Approve") return "Approved";
  if (/withdrawn/.test(h)) return "Withdrawn";
  if (/already has store/.test(h)) return "Pin already has a store";
  if (/outside the expansion area|phase 1/.test(h)) return "Outside the expansion area";
  if (/undercapitalised/.test(h)) return "Severely undercapitalised";
  if (/no open slot/.test(h)) return "Territory has no usable slot";
  if (/needs information/.test(h)) return "Missing or conflicting data";
  if (/verify/.test(h)) return "Risk to verify";
  if (/duplicate/.test(h)) return "Duplicate submission";
  if (/below the reject line/.test(h)) return "Score below reject line";
  if (/review band/.test(h)) return "Borderline score";
  if (/not launch-ready/.test(h)) return "Not launch-ready";
  if (/waitlisted/.test(h)) return "Waitlisted — slots full";
  if (/same pin/.test(h)) return "Lost the pin to a stronger partner";
  if (/outside the expansion plan/.test(h)) return "Qualifies outside the plan";
  if (/condition/.test(h)) return "Conditions to close";
  return "Other";
}

export default function Insights({ toast, dbOn }: { toast: (s: string) => void; dbOn: boolean }) {
  const { out } = useEngine();
  const rubric = useStore((s) => s.rubric);
  const batch = useStore((s) => s.batch)!;
  const localOutcomes = useStore((s) => s.outcomes);
  const set = useStore((s) => s.set);
  const [saved, setSaved] = useState<{ batches: SavedBatch[]; outcomes: SavedOutcome[] } | null>(null);
  const [pat, setPat] = useState<Awaited<ReturnType<typeof aiPatterns>> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/batch")
      .then((r) => r.json())
      .then((j) => setSaved({ batches: j.batches ?? [], outcomes: j.outcomes ?? [] }))
      .catch(() => setSaved({ batches: [], outcomes: [] }));
  }, []);

  // All batches: saved ones from the database, with the live batch swapped in fresh.
  const all: SavedBatch[] = useMemo(() => {
    if (!out) return [];
    const live: SavedBatch = {
      id: batch.id,
      created_at: batch.uploadedAt,
      file_name: batch.fileName,
      brand: { industry: "" },
      rubric_version: rubric.version,
      summary: out.summary,
      results: out.results.map((r) => ({ id: r.id, decision: r.decision, score: r.score, city: r.app.city, headline: r.headline, factors: r.factors.map((f) => ({ key: f.key, group: f.group, score: f.score })), issues: r.issues.filter((i) => i.severity !== "info").map((i) => i.code) })),
    };
    return [live, ...(saved?.batches ?? []).filter((b) => b.id !== batch.id)];
  }, [out, saved, batch, rubric.version]);

  const outcomes = useMemo(() => {
    const list: (SavedOutcome & { factors: SavedResult["factors"] })[] = [];
    const seen = new Set<string>();
    const fromLocal = Object.entries(localOutcomes).map(([k, o]) => ({ batch_id: k.split("|")[0], app_id: k.split("|")[1], opened: o.opened, on_time: o.onTime, payback_months: o.paybackMonths }));
    for (const o of [...fromLocal, ...(saved?.outcomes ?? [])]) {
      const key = `${o.batch_id}|${o.app_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const r = all.find((b) => b.id === o.batch_id)?.results.find((x) => x.id === o.app_id);
      if (r) list.push({ ...o, factors: r.factors });
    }
    return list;
  }, [localOutcomes, saved, all]);

  const results = all.flatMap((b) => b.results);
  const factorKeys = [...Object.keys(rubric.partner), ...Object.keys(rubric.location)];
  const dimAvg = (rs: SavedResult[], k: string) => {
    const v = rs.map((r) => dimensions(r.factors, rubric).find((d) => d.key === k)?.score).filter((x): x is number => typeof x === "number");
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const avg = (rs: SavedResult[], k: string) => {
    const v = rs.map((r) => r.factors.find((f) => f.key === k)?.score).filter((x): x is number => typeof x === "number");
    return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null;
  };
  const byDecision = Object.fromEntries(D.map((d) => [d, results.filter((r) => r.decision === d)])) as Record<Decision, SavedResult[]>;
  const reasons = new Map<string, number>();
  for (const r of results) if (r.decision !== "Approve") reasons.set(reasonOf(r.headline, r.decision), (reasons.get(reasonOf(r.headline, r.decision)) ?? 0) + 1);
  const reasonList = [...reasons].sort((a, b) => b[1] - a[1]);
  const maxReason = Math.max(1, ...reasonList.map((r) => r[1]));
  const issueCounts = new Map<string, number>();
  for (const r of results) for (const c of r.issues) issueCounts.set(c, (issueCounts.get(c) ?? 0) + 1);

  async function findPatterns() {
    if (!out) return;
    setBusy(true);
    const stats = {
      batches: all.length,
      applications: results.length,
      decisionMix: Object.fromEntries(D.map((d) => [d, byDecision[d].length])),
      averageFactorScoreByDecision: Object.fromEntries(factorKeys.map((k) => [k, Object.fromEntries(D.map((d) => [d, avg(byDecision[d], k)]))])),
      reasonsNotApproved: Object.fromEntries(reasonList),
      territoriesThisBatch: out.territories.map((t) => ({ id: t.id, city: t.territory.city, priority: t.territory.priority, slots: t.capacity, applicants: t.applicants.length, filled: t.allocated.length, waitlist: t.waitlist.length })),
      latentDemand: out.latentDemand,
      dataIssues: Object.fromEntries(issueCounts),
      outcomes: outcomes.map((o) => ({ opened: o.opened, onTime: o.on_time, paybackMonths: o.payback_months, factors: Object.fromEntries(o.factors.map((f) => [f.key, f.score])) })),
    };
    try {
      setPat(await aiPatterns(stats, rubric));
    } catch {
      toast("Pattern finder unavailable right now");
    }
    setBusy(false);
  }

  function toDraft() {
    if (!pat) return;
    const r: Rubric = structuredClone(rubric);
    const why: string[] = [];
    for (const c of pat.changes) {
      if (c.group === "partner" && c.key in r.partner) r.partner[c.key as keyof Rubric["partner"]] = Math.max(0, Math.round(c.to));
      else if (c.group === "location" && c.key in r.location) r.location[c.key as keyof Rubric["location"]] = Math.max(0, Math.round(c.to));
      else if (c.group === "approveMin" && c.key in r.approveMin) r.approveMin[c.key as keyof Rubric["approveMin"]] = Math.round(c.to);
      else continue;
      why.push(`${LABELS[c.key] ?? c.key} → ${c.to}: ${c.why}`);
    }
    // Keep each group at 100 by taking the difference out of its largest other weight.
    for (const g of ["partner", "location"] as const) {
      const obj = r[g] as Record<string, number>;
      const diff = 100 - Object.values(obj).reduce((a, b) => a + b, 0);
      if (diff) {
        const touched = pat.changes.filter((c) => c.group === g).map((c) => c.key);
        const k = Object.keys(obj).filter((x) => !touched.includes(x)).sort((a, b) => obj[b] - obj[a])[0];
        if (k) {
          obj[k] += diff;
          why.push(`${LABELS[k]} → ${obj[k]} so ${g} weights still add to 100.`);
        }
      }
    }
    set({ rubricDraft: { rubric: r, why }, tab: "settings", sub: "rubric", selected: null });
  }

  if (!out) return null;
  return (
    <>
      <h1 className="h-page">Insights</h1>
      <p className="lede" style={{ marginTop: 10 }}>
        {all.length} batch{all.length === 1 ? "" : "es"} · {results.length} applications · {outcomes.length} recorded store outcome{outcomes.length === 1 ? "" : "s"}
        {dbOn ? "" : " · database offline, showing this browser only"}.
      </p>

      <h3 className="section-h">What separates the decisions</h3>
      <div className="card white">
        <table className="table">
          <thead>
            <tr>
              <th>Average score /100</th>
              {D.map((d) => (
                <th key={d} style={{ color: DCOLOR[d] }}>
                  {d === "Hold" ? "On hold" : d} ({byDecision[d].length})
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {["money", "site", "operator", "location", "launch"].map((k) => (
              <tr key={k}>
                <td className="small">{dimensions([], rubric).find((d) => d.key === k)?.label}</td>
                {D.map((d) => {
                  const v = dimAvg(byDecision[d], k);
                  return (
                    <td key={d} className="num small" style={{ background: v === null ? undefined : `color-mix(in srgb, var(--accent) ${Math.round((v / 100) * 18)}%, transparent)` }}>
                      {v ?? "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid g2" style={{ marginTop: 18 }}>
        <div className="card white">
          <p className="eyebrow">Why partners didn&apos;t get a straight yes</p>
          <div className="stack" style={{ marginTop: 14 }}>
            {reasonList.map(([k, v]) => (
              <div key={k}>
                <div className="spread small">
                  <span>{k}</span>
                  <b className="mono">{v}</b>
                </div>
                <div className="track" style={{ marginTop: 4 }}>
                  <i style={{ width: `${(v / maxReason) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card white">
          <p className="eyebrow">Territory demand vs slots (this batch)</p>
          <div className="stack" style={{ marginTop: 14 }}>
            {out.territories.map((t) => (
              <div key={t.id}>
                <div className="spread small">
                  <span>
                    {t.id} {t.territory.city}
                  </span>
                  <span className="mono">
                    {t.applicants.length} for {t.capacity}
                  </span>
                </div>
                <div className="track" style={{ marginTop: 4 }}>
                  <i className={t.demandRatio > 1.5 ? "lo" : t.applicants.length < t.capacity ? "mid" : ""} style={{ width: `${Math.min(100, (t.applicants.length / Math.max(1, t.capacity * 3)) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {all.length > 1 && (
        <>
          <h3 className="section-h">All batches</h3>
          <div className="card white">
            <table className="table">
              <thead>
                <tr>
                  <th>Uploaded</th>
                  <th>File</th>
                  <th>Rubric</th>
                  <th>Apps</th>
                  {D.map((d) => (
                    <th key={d}>{d}</th>
                  ))}
                  <th>Slots filled</th>
                </tr>
              </thead>
              <tbody>
                {all.map((b) => (
                  <tr key={b.id}>
                    <td className="small">{new Date(b.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}</td>
                    <td className="small">
                      {b.file_name}
                      {b.id === batch.id && <span className="tag" style={{ marginLeft: 6 }}>current</span>}
                    </td>
                    <td className="num">v{b.rubric_version}</td>
                    <td className="num">{b.summary.total}</td>
                    {D.map((d) => (
                      <td key={d} className="num">
                        {b.summary.counts[d]}
                      </td>
                    ))}
                    <td className="num">
                      {b.summary.slotsFilled}/{b.summary.slotsOpen}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3 className="section-h">Pattern finder</h3>
      <div className="card dark">
        <p style={{ maxWidth: 640 }}>
          Reads every batch and every recorded outcome, and suggests new weights or tier minimums. Suggestions go to the Rubric tab as a draft — nothing changes until the team previews the impact and approves a new version.
        </p>
        {outcomes.length < 5 && (
          <p className="small muted" style={{ marginTop: 8 }}>
            Only {outcomes.length} store outcome{outcomes.length === 1 ? "" : "s"} recorded so far (record them on approved partners) — until then suggestions lean on decision patterns, and say so.
          </p>
        )}
        <div style={{ marginTop: 16 }}>
          <Btn variant="red" onClick={findPatterns} disabled={busy}>
            {busy ? "Reading the batches…" : "Find patterns"}
          </Btn>
        </div>
        {pat && (
          <div className="fade-in" style={{ marginTop: 22 }}>
            <p style={{ fontSize: 17 }}>{pat.summary}</p>
            <ul style={{ marginTop: 10, paddingLeft: 18 }}>
              {pat.findings?.map((f) => (
                <li key={f} className="small" style={{ marginTop: 4 }}>
                  {f}
                </li>
              ))}
            </ul>
            {pat.changes?.length ? (
              <>
                <p className="eyebrow" style={{ marginTop: 16 }}>
                  Suggested changes
                </p>
                {pat.changes.map((c, i) => (
                  <p key={i} className="small" style={{ marginTop: 6 }}>
                    <b>{LABELS[c.key] ?? c.key}</b> ({c.group}) → {c.to}. <span style={{ opacity: 0.75 }}>{c.why}</span>
                  </p>
                ))}
                <div style={{ marginTop: 16 }}>
                  <Btn onClick={toDraft}>Preview as a rubric draft</Btn>
                </div>
              </>
            ) : (
              <p className="small" style={{ marginTop: 12, opacity: 0.75 }}>
                No change recommended yet.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
