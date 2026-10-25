"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { Decision } from "@/lib/engine/types";

export function Ring({ value, max = 100, size = 64, stroke = 1.5, label, color = "var(--accent)", track = "var(--line-strong)", fontSize }: { value: number; max?: number; size?: number; stroke?: number; label?: ReactNode; color?: string; track?: string; fontSize?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={`${c * pct} ${c}`} strokeLinecap="round" style={{ transition: "stroke-dasharray .6s ease" }} />
      </svg>
      <b style={{ fontSize: fontSize ?? Math.round(size / 4.2) }}>{label ?? Math.round(value)}</b>
    </span>
  );
}

export const DCOLOR: Record<Decision, string> = { Approve: "var(--approve)", Conditional: "var(--conditional)", Hold: "var(--hold)", Reject: "var(--reject)" };

export function ScoreRing({ score, decision, size = 56 }: { score: number; decision: Decision; size?: number }) {
  return <Ring value={score} size={size} stroke={1.5} color={DCOLOR[decision]} label={Math.round(score)} fontSize={Math.round(size / 3.6)} />;
}

export function Pill({ d, children }: { d: Decision | "plain"; children?: ReactNode }) {
  return <span className={`pill ${d}`}>{children ?? d}</span>;
}

export function STitle({ children, left }: { children: ReactNode; left?: boolean }) {
  return (
    <div className={`stitle${left ? " left" : ""}`}>
      <h3>{children}</h3>
    </div>
  );
}

export function Btn({ children, onClick, variant, disabled, arrow = true, type = "button", small }: { children: ReactNode; onClick?: () => void; variant?: "ghost" | "red"; disabled?: boolean; arrow?: boolean; type?: "button" | "submit"; small?: boolean }) {
  return (
    <button type={type} className={`btn${variant ? " " + variant : ""}${arrow ? "" : " plain"}${small ? " sm" : ""}`} onClick={onClick} disabled={disabled}>
      {children}
      {arrow && (
        <span className="arrow">
          <Icon name="arrow" size={14} />
        </span>
      )}
    </button>
  );
}

const PATHS: Record<string, string> = {
  arrow: "M5 12h14M13 6l6 6-6 6",
  down: "M12 5v14M6 13l6 6 6-6",
  up: "M12 19V5M6 11l6-6 6 6",
  chat: "M4 5h16v11H8l-4 4z",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6L6 18",
  back: "M19 12H5M11 6l-6 6 6 6",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3",
  send: "M4 12l16-8-6 16-3-7z",
  edit: "M4 20h4L19 9l-4-4L4 16z",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  check: "M5 12l5 5 9-10",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6",
  map: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  refresh: "M20 11a8 8 0 10-2.3 5.7M20 4v7h-7",
  download: "M12 4v12M6 11l6 6 6-6M4 20h16",
};

export function Icon({ name, size = 18, stroke = 2 }: { name: keyof typeof PATHS | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name] ?? PATHS.arrow} />
    </svg>
  );
}

export function LogoMark() {
  // "FR." — the word mark, with the accent full stop.
  return (
    <span style={{ fontSize: 27, fontWeight: 500, letterSpacing: "-0.08em", lineHeight: 1 }} aria-hidden>
      FR<span style={{ color: "var(--accent)" }}>.</span>
    </span>
  );
}

/** Thin scroll ruler under the header with a blue percentage marker. */
export function Ruler() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const on = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setPct(h > 0 ? Math.round((window.scrollY / h) * 100) : 0);
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, []);
  return (
    <div className="ruler" aria-hidden>
      <b style={{ left: `${Math.min(98, Math.max(2, pct))}%` }}>{String(pct).padStart(2, "0")}%</b>
    </div>
  );
}

export function ThemeToggle() {
  const toggle = () => {
    const el = document.documentElement;
    const next = el.dataset.theme === "dark" ? "light" : "dark";
    el.dataset.theme = next;
    try {
      localStorage.setItem("outpost-theme", next);
    } catch {}
  };
  return (
    <button className="iconbtn" onClick={toggle} title="Light / dark" aria-label="Toggle light or dark theme">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" />
      </svg>
    </button>
  );
}

/** Turns APP-012 / TER-03 mentions into clickable links. */
export function Linkify({ text, onId }: { text: string; onId: (id: string) => void }) {
  const parts = text.split(/\b((?:APP|ROW|TER)[-\s]?\d+(?:#\d)?)\b/g);
  return (
    <>
      {parts.map((p, i) =>
        /^(APP|ROW|TER)[-\s]?\d+/.test(p) ? (
          <button key={i} className="idlink" onClick={() => onId(p)}>
            {p}
          </button>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
