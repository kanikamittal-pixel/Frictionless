"use client";
import { Fragment, useMemo } from "react";
import { useStore } from "@/lib/store";
import { simpleRows, TIER_CITIES } from "@/lib/criteria";
import { INDUSTRIES, buildProfile } from "@/lib/engine/brand";
import { CITIES } from "@/lib/engine/reference";
import type { Decision, Tier } from "@/lib/engine/types";
import { Btn, Pill } from "./ui";

// The Scoring tab on the home page: how partners are judged, in plain words,
// and the industry standards used for Tier 1, 2 and 3 cities.

const TIERS: Tier[] = ["Tier 1", "Tier 2", "Tier 3"];
const AREAS = ["Money", "Site", "Operator", "Location", "Launch"];
const AREA_Q: Record<string, string> = {
  Money: "Can they pay for it?",
  Site: "Do they have the right shop?",
  Operator: "Can they run it?",
  Location: "Is it a good place for us?",
  Launch: "How soon can they open?",
};

export default function ScoringPage({ onBack }: { onBack: () => void }) {
  const rubric = useStore((s) => s.rubric);
  const brand = useStore((s) => s.brand);
  const setup = useStore((s) => s.setup);
  const set = useStore((s) => s.set);
  const setSetup = useStore((s) => s.setSetup);
  const rows = useMemo(() => simpleRows(rubric, brand), [rubric, brand]);
  const total = (a: string) => +rows.filter((r) => r.area === a).reduce((x, r) => x + r.points, 0).toFixed(1);

  const pickIndustry = (key: string) => {
    setSetup({ industryKey: key });
    if (setup.modelKey !== "other") set({ brand: buildProfile(key, setup.modelKey) });
  };

  const checks: [string, Decision, string][] = [
    ["Details are missing or don't match", "Hold", "we ask one question"],
    ["The pin code already has one of our stores", "Reject", "we never open two stores in one pin"],
    ["The pin code is outside our expansion areas", "Hold", "kept on the waitlist"],
    ["The area has no open slot left", "Reject", ""],
    [`The money is less than half the setup cost`, "Reject", ""],
  ];
  const decisions: [Decision, string][] = [
    ["Approve", `Wins a slot and scores at least the bar for its city: Tier 1 ${rubric.approveMin["Tier 1"]} · Tier 2 ${rubric.approveMin["Tier 2"]} · Tier 3 ${rubric.approveMin["Tier 3"]}.`],
    ["Conditional", "Wins a slot, but something must be fixed first — for example no shop yet, or a small money gap. The slot is held for 60 days."],
    ["Hold", `No slot left (better partners took them), or the score is in the middle (${rubric.rejectBelow}–${rubric.conditionalMin}) and needs a human look.`],
    ["Reject", `Failed one of the quick checks, or scored below ${rubric.rejectBelow}.`],
  ];
  const payback = (t: Tier) => {
    const p = brand.revenueLakhPerMonth[t] * (brand.marginPct / 100);
    return p > 0 ? Math.round(brand.capexLakh[t] / p) : 0;
  };
  const demoBase: Record<Tier, number> = { "Tier 1": 8, "Tier 2": 6.5, "Tier 3": 5 };

  return (
    <div className="page scoring fade-in">
      <p className="eyebrow muted">Scoring · rubric v{rubric.version}</p>
      <h1 className="h-hero" style={{ marginTop: 16, fontSize: "clamp(2.8rem, 1.6rem + 4.4vw, 6rem)" }}>
        How partners are scored<span style={{ color: "var(--accent)" }}>.</span>
      </h1>
      <p className="lede" style={{ marginTop: 16 }}>
        Every application goes through the same three steps. Here they are in plain words, for <b style={{ color: "var(--ink)" }}>{brand.industry}</b>.
      </p>

      {/* Step 1 */}
      <h3 className="section-h">
        <span>Step 1 · Five quick checks</span>
        <span className="meta">Before any score</span>
      </h3>
      <div className="sc-checks">
        {checks.map(([c, d, note], i) => (
          <div key={c} className="sc-check">
            <span className="mono faint">{String(i + 1).padStart(2, "0")}</span>
            <span>
              {c}
              {note && <span className="muted"> — {note}</span>}
            </span>
            <Pill d={d} />
          </div>
        ))}
      </div>

      {/* Step 2 */}
      <h3 className="section-h">
        <span>Step 2 · A score out of 100</span>
        <span className="meta">13 things, 5 areas</span>
      </h3>
      <div className="sc-areas">
        {AREAS.map((a) => (
          <div key={a} className="sc-area">
            <span className="sc-area-n">{total(a)}</span>
            <b>{a}</b>
            <span className="small muted">{AREA_Q[a]}</span>
          </div>
        ))}
      </div>
      <div className="card white" style={{ marginTop: 18, padding: "8px 18px" }}>
        <table className="table sc-table">
          <thead>
            <tr>
              <th>What we look at</th>
              <th style={{ width: 70 }}>Points</th>
              <th>Full marks</th>
              <th>Low marks</th>
            </tr>
          </thead>
          <tbody>
            {AREAS.map((a) => (
              <Fragment key={a}>
                <tr className="sc-group">
                  <td colSpan={4}>
                    <span className="eyebrow">{a}</span> <span className="xs muted">· {total(a)} points</span>
                  </td>
                </tr>
                {rows
                  .filter((r) => r.area === a)
                  .map((r) => (
                    <tr key={r.key}>
                      <td>{r.what}</td>
                      <td className="num">{r.points}</td>
                      <td className="small" data-l="Full marks">{r.full}</td>
                      <td className="small muted" data-l="Low marks">{r.low}</td>
                    </tr>
                  ))}
              </Fragment>
            ))}
            <tr className="sc-total">
              <td>Total</td>
              <td className="num">100</td>
              <td colSpan={2} className="small muted">
                Each line is marked 0–10, then scaled to its points.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Step 3 */}
      <h3 className="section-h">
        <span>Step 3 · The decision</span>
        <span className="meta">One store per pin code</span>
      </h3>
      <div className="sc-checks">
        {decisions.map(([d, t]) => (
          <div key={d} className="sc-check sc-dec">
            <Pill d={d} />
            <span>{t}</span>
          </div>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 16, maxWidth: 760 }}>
        If two people want the same pin code, the higher score gets it — the other may be offered a free pin nearby in the same area. Slots in each area go to the highest scores.
      </p>

      {/* Industry standards */}
      <h3 className="section-h">
        <span>Industry standards by city tier</span>
        <span className="meta">What the scores are measured against</span>
      </h3>
      <div className="grid g3">
        {TIERS.map((t) => (
          <div key={t} className="card paper">
            <p className="eyebrow">{t}</p>
            <p style={{ fontSize: 18, letterSpacing: "-0.02em", marginTop: 6 }}>{TIER_CITIES[t]}</p>
            <p className="eyebrow muted" style={{ marginTop: 8 }}>
              Pins {CITIES.filter((c) => c.tier === t).map((c) => `${c.prefix}xxx`).join(" · ")}
            </p>
          </div>
        ))}
      </div>

      <div className="spread" style={{ marginTop: 30, flexWrap: "wrap", alignItems: "flex-end" }}>
        <p className="eyebrow">Standards for · {brand.industry}</p>
        <div className="chips">
          {INDUSTRIES.map((i) => (
            <button key={i.key} className={`chip sm${brand.industryKey === i.key && setup.industryKey !== "other" ? " on" : ""}`} onClick={() => pickIndustry(i.key)}>
              {i.label}
            </button>
          ))}
        </div>
      </div>
      <div className="card white" style={{ marginTop: 14, padding: "8px 18px" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Standard</th>
              {TIERS.map((t) => (
                <th key={t}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                Setup cost the partner must fund
                <div className="xs muted">full marks at 1.3× this; rejected under half</div>
              </td>
              {TIERS.map((t) => (
                <td key={t} className="num big-num">
                  ₹{brand.capexLakh[t]}L
                </td>
              ))}
            </tr>
            <tr>
              <td>Expected monthly sales</td>
              {TIERS.map((t) => (
                <td key={t} className="num">
                  ₹{brand.revenueLakhPerMonth[t]}L
                </td>
              ))}
            </tr>
            <tr>
              <td>Operating margin</td>
              {TIERS.map((t) => (
                <td key={t} className="num">
                  {brand.marginPct}%
                </td>
              ))}
            </tr>
            <tr>
              <td>Rough payback</td>
              {TIERS.map((t) => (
                <td key={t} className="num">
                  ~{payback(t)} months
                </td>
              ))}
            </tr>
            <tr>
              <td>
                Starting score for people &amp; spending
                <div className="xs muted">before the neighbourhood is considered</div>
              </td>
              {TIERS.map((t) => (
                <td key={t} className="num">
                  {demoBase[t]} / 10
                </td>
              ))}
            </tr>
            <tr>
              <td>Score needed to approve</td>
              {TIERS.map((t) => (
                <td key={t} className="num">
                  {rubric.approveMin[t]} / 100
                </td>
              ))}
            </tr>
            <tr>
              <td>Shop size (same in every tier)</td>
              <td colSpan={3} className="num">
                {brand.sqft.idealMin}–{brand.sqft.idealMax} sq ft · {brand.groundCritical ? "ground floor needed" : "upper floor fine"} · {brand.staff} staff
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="eyebrow" style={{ marginTop: 30 }}>
        All industries · setup cost and monthly sales
      </p>
      <div className="card white" style={{ marginTop: 12, padding: "8px 18px" }}>
        <table className="table sc-ind">
          <thead>
            <tr>
              <th>Industry</th>
              <th>Setup T1</th>
              <th>Setup T2</th>
              <th>Setup T3</th>
              <th>Sales / month T1 · T2 · T3</th>
              <th>Shop size</th>
            </tr>
          </thead>
          <tbody>
            {INDUSTRIES.map((i) => (
              <tr key={i.key} className={brand.industryKey === i.key ? "is-cur" : ""}>
                <td>{i.label}</td>
                {TIERS.map((t) => (
                  <td key={t} className="num">
                    ₹{i.base.capexLakh[t]}L
                  </td>
                ))}
                <td className="num">
                  ₹{i.base.revenueLakhPerMonth["Tier 1"]}L · ₹{i.base.revenueLakhPerMonth["Tier 2"]}L · ₹{i.base.revenueLakhPerMonth["Tier 3"]}L
                </td>
                <td className="num">
                  {i.base.sqft.idealMin}–{i.base.sqft.idealMax}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="clean-list" style={{ marginTop: 18 }}>
        <li className="small muted">
          <span className="dot" />
          Eyewear uses Lenskart&apos;s published franchise figures: about ₹35 lakh for a regular store, about ₹20 lakh for the small-town “Lite” format, 250–500 sq ft.
        </li>
        <li className="small muted">
          <span className="dot" />
          The other industries are typical figures for that kind of store, used as starting assumptions. Figures above are for the franchise-owned, franchise-operated model; other business models adjust them (for example a shop-in-shop needs about 30% of the money).
        </li>
        <li className="small muted">
          <span className="dot" />
          You can change any of these numbers on the Home tab under “Tune numbers” before uploading.
        </li>
      </ul>

      <div className="row wrap" style={{ marginTop: 34 }}>
        <Btn onClick={onBack}>Back to Home</Btn>
      </div>
    </div>
  );
}
