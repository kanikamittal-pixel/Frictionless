"use client";
import { useStore } from "@/lib/store";
import { useEngine } from "@/lib/useEngine";
import type { Decision, EngineOutput } from "@/lib/engine/types";
import { cityForPin } from "@/lib/engine/reference";
import { useState } from "react";
import { ScoreRing } from "./ui";
import Terrain from "./Terrain";

const D: Decision[] = ["Approve", "Conditional", "Hold", "Reject"];

export function headlineInsights(out: EngineOutput): { tone: "green" | "amber" | "blue" | "red"; text: string }[] {
  const items: { tone: "green" | "amber" | "blue" | "red"; text: string }[] = [];
  const { summary } = out;
  const open = out.territories.filter((t) => t.capacity > t.allocated.length);
  items.push({
    tone: summary.slotsFilled === summary.slotsOpen ? "green" : "amber",
    text: `${summary.slotsFilled} of ${summary.slotsOpen} usable slots are filled.${open.length ? ` Still open: ${open.map((t) => `${t.id} ${t.territory.city} (${t.capacity - t.allocated.length})`).join(", ")}.` : ""}`,
  });
  const hot = out.territories.filter((t) => t.waitlist.length).sort((a, b) => b.demandRatio - a.demandRatio);
  if (hot.length) items.push({ tone: "blue", text: `Over-subscribed: ${hot.slice(0, 3).map((t) => `${t.id} ${t.territory.city} (${t.applicants.length} applicants for ${t.capacity} slot${t.capacity === 1 ? "" : "s"})`).join("; ")}. ${hot.reduce((a, t) => a + t.waitlist.length, 0)} qualified partners are waitlisted — adding slots there is the cheapest growth.` });
  const moved = out.results.filter((r) => r.conditions.some((c) => c.code === "relocate-pin") && r.slot === "won");
  if (summary.contestedPins) items.push({ tone: "blue", text: `${summary.contestedPins} pin code${summary.contestedPins === 1 ? " was" : "s were"} contested. One store per pin: the best score kept the pin${moved.length ? `, and ${moved.map((r) => r.id).join(", ")} ${moved.length === 1 ? "was" : "were"} offered a free pin in the same territory instead of losing out` : ""}.` });
  const storeHits = out.results.filter((r) => /already has store/.test(r.headline));
  if (storeHits.length) items.push({ tone: "red", text: `${storeHits.length} application${storeHits.length === 1 ? "" : "s"} asked for a pin that already has a store (${[...new Set(storeHits.map((r) => r.headline.match(/store (ST-\d+)/)?.[1]))].join(", ")}) — rejected on the same-pin rule, with nearby open pins suggested.` });
  for (const l of out.latentDemand) {
    const cityTer = out.territories.find((t) => (cityForPin(t.territory.pins[0] ?? "")?.name ?? t.territory.city) === l.city);
    items.push({ tone: "amber", text: `Latent demand: ${l.count} applicant${l.count === 1 ? "" : "s"} (avg score ${l.avgScore}) want ${l.city} pins outside the plan${cityTer && cityTer.capacity === 0 ? `, while ${cityTer.id} there has no usable pin` : ""}. Worth adding those pins as a territory.` });
  }
  if (summary.gateScenario === "B") items.push({ tone: "red", text: "No application matched a preferred territory, so the Phase 1 hard reject was lifted and every application carries 'Not a preferred location for company'." });
  const needInfo = out.results.filter((r) => r.decision === "Hold" && /Needs information|Verify|Duplicate/.test(r.headline));
  if (needInfo.length) items.push({ tone: "amber", text: `${needInfo.length} on hold for missing, conflicting or risky information (${needInfo.map((r) => r.id).join(", ")}). One reply each could move them.` });
  if (summary.dataIssues) items.push({ tone: "blue", text: `${summary.dataIssues} data-quality warnings were found and handled — see Data health.` });
  return items;
}

export default function Overview() {
  const { out } = useEngine();
  const batch = useStore((s) => s.batch)!;
  const brand = useStore((s) => s.brand);
  const open = useStore((s) => s.open);
  const set = useStore((s) => s.set);
  const [all, setAll] = useState(false);
  if (!out) return null;
  const { summary } = out;
  const notes = headlineInsights(out);
  const shown = all ? notes : notes.slice(0, 3);
  const decide = out.results.filter((r) => r.decision === "Conditional").sort((a, b) => b.score - a.score);

  return (
    <>
      <Terrain className="page-band" scale={1.35} seed={7} intensity={0.75} edge>
        <div className="spread eyebrow muted">
          <span>{batch.fileName}</span>
          <span>{brand.industry}</span>
        </div>
        <h1 className="h-hero" style={{ marginTop: 34, fontSize: "clamp(2.8rem, 1.6rem + 4.4vw, 6rem)" }}>
          {summary.total} applications, decided<span style={{ color: "var(--accent)" }}>.</span>
          <span className="caret" />
        </h1>
        <p className="lede" style={{ marginTop: 18 }}>
          Open any partner for the reason and next steps, or ask the analyst.
        </p>
      </Terrain>

      <div className="counters" style={{ marginTop: 40 }}>
        {D.map((d) => (
          <button key={d} className="counter" onClick={() => set({ tab: "decisions", selected: null, filter: d })}>
            <span className="num">
              {String(summary.counts[d]).padStart(2, "0")}
              <span className="outline">/{String(summary.total).padStart(2, "0")}</span>
            </span>
            <span className="lbl">
              <span className={`pill ${d}`}>{d === "Hold" ? "On hold" : d}</span>
            </span>
          </button>
        ))}
      </div>

      <h3 className="section-h">
        <span>Worth knowing</span>
        <span className="meta">{notes.length} notes · engine</span>
      </h3>
      <ul className="clean-list insights">
        {shown.map((it, i) => (
          <li key={i}>
            <span className={`dot ${it.tone}`} />
            {it.text}
          </li>
        ))}
      </ul>
      {notes.length > 3 && (
        <button className="linkbtn small" onClick={() => setAll(!all)} style={{ marginTop: 8 }}>
          {all ? "Show less" : `Show all ${notes.length}`}
        </button>
      )}

      {decide.length > 0 && (
        <>
          <h3 className="section-h">
            <span>Waiting on conditions</span>
            <span className="meta">Team decides</span>
          </h3>
          <div className="dlist">
            {decide.slice(0, 5).map((r) => (
              <button key={r.id} className="drow slim" onClick={() => open(r.id)}>
                <ScoreRing score={r.score} decision={r.decision} size={44} />
                <div style={{ minWidth: 0 }}>
                  <b>
                    {r.id} · {r.app.name || "Unnamed"}
                  </b>
                  <p className="why">{r.conditions[0]?.text}</p>
                </div>
                <span className="faint xs">{r.conditions.length > 1 ? `+${r.conditions.length - 1} more` : ""}</span>
              </button>
            ))}
          </div>
          {decide.length > 5 && (
            <button className="linkbtn small" style={{ marginTop: 10 }} onClick={() => set({ tab: "decisions", selected: null, filter: "Conditional" })}>
              See all {decide.length}
            </button>
          )}
        </>
      )}

      <h3 className="section-h">
        <span>Slots by territory</span>
        <span className="meta">
          {summary.slotsFilled}/{summary.slotsOpen} filled
        </span>
      </h3>
      <div>
        <table className="table">
          <thead>
            <tr>
              <th>Territory</th>
              <th>Priority</th>
              <th>Applied</th>
              <th>Filled</th>
            </tr>
          </thead>
          <tbody>
            {out.territories.map((t) => (
              <tr key={t.id}>
                <td>
                  <b>{t.id}</b> <span className="muted small">{t.territory.city}</span>
                </td>
                <td className="small">{t.territory.priority ?? "—"}</td>
                <td className="num">{t.applicants.length}</td>
                <td>
                  <div className="slots">
                    {Array.from({ length: t.capacity }).map((_, i) => (
                      <i key={i} className={i < t.allocated.length ? "full" : ""} />
                    ))}
                    {t.capacity === 0 && <span className="xs faint">no usable slot</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {summary.dataIssues > 0 && (
        <p className="small muted" style={{ marginTop: 28 }}>
          {summary.dataIssues} messy or conflicting cells were found and handled.{" "}
          <button className="linkbtn" onClick={() => set({ tab: "settings", sub: "health", selected: null })}>
            View data checks
          </button>
        </p>
      )}
    </>
  );
}
