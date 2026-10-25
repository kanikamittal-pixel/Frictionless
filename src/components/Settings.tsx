"use client";
import { useStore, type Sub } from "@/lib/store";
import RubricView from "./RubricView";
import Health from "./Health";
import Log from "./Log";
import Method from "./Method";

const SUBS: { key: Sub; label: string }[] = [
  { key: "rubric", label: "Rubric" },
  { key: "health", label: "Data checks" },
  { key: "log", label: "Change log" },
  { key: "method", label: "How it decides" },
];

export default function Settings({ toast }: { toast: (s: string) => void }) {
  const sub = useStore((s) => s.sub);
  const set = useStore((s) => s.set);
  return (
    <>
      <div className="chips" style={{ marginBottom: 36 }}>
        {SUBS.map((x) => (
          <button key={x.key} className={`chip${sub === x.key ? " on" : ""}`} onClick={() => set({ sub: x.key })}>
            {x.label}
          </button>
        ))}
      </div>
      {sub === "rubric" && <RubricView toast={toast} />}
      {sub === "health" && <Health />}
      {sub === "log" && <Log />}
      {sub === "method" && <Method />}
    </>
  );
}
