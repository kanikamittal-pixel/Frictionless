"use client";
import { CITIES, EXISTING_STORES } from "@/lib/engine/reference";

// Blueprint-style schematic of the seven cities, placed by real coordinates,
// with existing stores and road distances from the Bengaluru hub.

const B = { latMin: 11.9, latMax: 16.2, lngMin: 73.9, lngMax: 78.6 };

export default function KarnatakaMap({ demand, wide }: { demand?: Record<string, number>; wide?: boolean }) {
  const W = wide ? 620 : 420;
  const H = wide ? 500 : 480;
  const pad = 40;
  const px = (_lat: number, lng: number) => pad + ((lng - B.lngMin) / (B.lngMax - B.lngMin)) * (W - pad * 2 - 110);
  const py = (lat: number, _lng: number) => pad + ((B.latMax - lat) / (B.latMax - B.latMin)) * (H - pad * 2);
  const hub = CITIES[0];
  const hx = px(hub.lat, hub.lng);
  const hy = py(hub.lat, hub.lng);
  const ink = { fill: "var(--ink)" };
  const muted = { fill: "var(--muted)" };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} role="img" aria-label="Map of the seven cities with existing stores">
      {CITIES.slice(1).map((c) => {
        const x = px(c.lat, c.lng);
        const y = py(c.lat, c.lng);
        return (
          <g key={c.name}>
            <line x1={hx} y1={hy} x2={x} y2={y} style={{ stroke: "var(--line-strong)" }} strokeDasharray="2 5" />

          </g>
        );
      })}
      {CITIES.map((c) => {
        const n = EXISTING_STORES.filter((s) => s.city === c.name).length;
        const dm = demand?.[c.name] ?? 0;
        const x = px(c.lat, c.lng);
        const y = py(c.lat, c.lng);
        const r = 5 + n * 2.2;
        const isHub = c.name === "Bengaluru";
        const left = c.name === "Tumakuru";
        const tx = left ? x - r - 11 : x + r + 11;
        const anchor = left ? "end" : "start";
        return (
          <g key={c.name}>
            {dm > 0 && <circle cx={x} cy={y} r={r + 10 + dm * 2} style={{ fill: "var(--accent-soft)", stroke: "var(--accent)" }} strokeDasharray="2 3" />}
            {isHub && (
              <circle cx={x} cy={y} r={r + 6} fill="none" style={{ stroke: "var(--accent)" }} strokeWidth={1}>
                <animate attributeName="r" values={`${r + 3};${r + 26}`} dur="2.6s" repeatCount="indefinite" />
                <animate attributeName="opacity" values=".9;0" dur="2.6s" repeatCount="indefinite" />
              </circle>
            )}
            <line x1={x - r - 7} y1={y} x2={x + r + 7} y2={y} style={{ stroke: "var(--line-strong)" }} />
            <line x1={x} y1={y - r - 7} x2={x} y2={y + r + 7} style={{ stroke: "var(--line-strong)" }} />
            <circle cx={x} cy={y} r={r} style={n ? { fill: "var(--accent)" } : { fill: "var(--bg)", stroke: "var(--ink)" }} strokeWidth={1} />
            {n > 0 && (
              <text x={x} y={y + 3.5} textAnchor="middle" fontSize={10} fontFamily="var(--mono)" style={{ fill: "var(--on-accent)" }}>
                {n}
              </text>
            )}
            <text x={tx} y={y - 3} textAnchor={anchor} fontSize={14} fontWeight={500} letterSpacing="-0.02em" style={ink}>
              {c.name}
            </text>
            <text x={tx} y={y + 11} textAnchor={anchor} fontSize={9.5} fontFamily="var(--mono)" style={muted}>
              {c.tier.toUpperCase()} · {c.prefix}XXX{dm ? ` · ${dm} APPLIED` : ""}
            </text>
            {isHub && (
              <text x={x + r + 11} y={y + 24} fontSize={9.5} fontFamily="var(--mono)" style={{ fill: "var(--accent-text)" }}>
                HUB · {c.lat.toFixed(2)}° N, {c.lng.toFixed(2)}° E
              </text>
            )}
          </g>
        );
      })}
      <g fontFamily="var(--mono)" fontSize={9.5} style={muted}>
        <circle cx={W - 150} cy={H - 34} r={5} style={{ fill: "var(--accent)" }} />
        <text x={W - 138} y={H - 31}>
          CITY WITH STORES (COUNT)
        </text>
        <circle cx={W - 150} cy={H - 16} r={5} style={{ fill: "var(--bg)", stroke: "var(--ink)" }} />
        <text x={W - 138} y={H - 13}>
          NO STORE YET
        </text>
      </g>
    </svg>
  );
}
