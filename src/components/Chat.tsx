"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore, uid, type ChatMsg } from "@/lib/store";
import { useEngine } from "@/lib/useEngine";
import { aiChat, chatContext, type ChatReply } from "@/lib/ai";
import { rulesChat } from "@/lib/chatRules";
import { checkEdits, commitEdits, commitOverride, previewEdits } from "@/lib/actions";
import { Icon, Linkify, Pill } from "./ui";
import DiffList from "./DiffList";

export default function Chat({ open, aiOn, toast }: { open: boolean; aiOn: boolean; toast: (s: string) => void }) {
  const { input, out } = useEngine();
  const chat = useStore((s) => s.chat);
  const push = useStore((s) => s.pushChat);
  const patch = useStore((s) => s.patchChat);
  const openId = useStore((s) => s.open);
  const set = useStore((s) => s.set);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.length, busy]);

  const suggestions = useMemo(() => {
    if (!out) return [];
    const s: string[] = [];
    const hold = out.results.find((r) => r.decision === "Hold" && r.slot !== "none") ?? out.results.find((r) => r.decision === "Hold");
    if (hold) s.push(`Why is ${hold.id} on hold?`);
    const nys = out.results.find((r) => r.app.space === "Not yet identified" && r.decision !== "Reject");
    if (nys) s.push(`${nys.id} has now found a ground-floor space`);
    s.push("Which territory is most contested?");
    const rej = out.results.find((r) => r.decision === "Reject" && r.paths.length);
    if (rej) s.push(`What would ${rej.id} need to get approved?`);
    const appr = out.results.find((r) => r.decision === "Approve" && r.nextInLine);
    if (appr) s.push(`${appr.id} has withdrawn`);
    const full = out.territories.find((t) => t.waitlist.length);
    if (full) s.push(`${full.id} now has ${full.capacity + 1} open slots`);
    return s;
  }, [out]);

  async function send(msg: string) {
    const m = msg.trim();
    if (!m || !input || !out || busy) return;
    setText("");
    push({ id: uid(), role: "user", text: m, at: new Date().toISOString() });
    setBusy(true);
    let reply: ChatReply;
    let source: "ai" | "rules" = "ai";
    try {
      if (!aiOn) throw new Error("off");
      const history = useStore.getState().chat.slice(-7, -1).map((c) => ({ role: c.role, text: c.text }));
      reply = await aiChat(m, history, chatContext(input, out, m));
    } catch {
      reply = rulesChat(m, out);
      source = "rules";
    }
    const msgOut: ChatMsg = { id: uid(), role: "assistant", text: reply.answer || "Done.", at: new Date().toISOString(), source };
    if (reply.kind === "update" && reply.edits.length) {
      const chk = checkEdits(reply.edits);
      msgOut.proposal = { edits: chk.ok, assumptions: reply.assumptions, lines: chk.lines, errors: chk.errors, impact: chk.ok.length ? previewEdits(chk.ok) : [], status: "pending" };
    } else if (reply.kind === "override" && reply.override) {
      const r = out.results.find((x) => x.id === reply.override!.id);
      if (r) msgOut.override = { ...reply.override, status: "pending", from: r.decision };
      else msgOut.text = `I couldn't find ${reply.override.id}.`;
    }
    push(msgOut);
    setBusy(false);
  }

  const apply = (m: ChatMsg) => {
    if (!m.proposal) return;
    const userMsg = [...useStore.getState().chat].reverse().find((c) => c.role === "user" && c.at <= m.at);
    const e = commitEdits(m.proposal.edits, userMsg?.text ?? m.text, "chat");
    patch(m.id, { proposal: { ...m.proposal, impact: e.impact, status: "applied" } });
    const changed = e.impact.filter((d) => d.from !== d.to);
    toast(changed.length ? `${changed.length} decision${changed.length === 1 ? "" : "s"} changed` : "Applied — no decision changed");
  };

  return (
    <aside className={`side${open ? "" : " closed"}`} aria-label="Analyst chat" style={open ? undefined : { display: "none" }}>
      <div className="chat-head">
        <div className="spread">
          <div>
            <h4>Ask or update</h4>
          </div>
          <button className="iconbtn" onClick={() => set({ chatOpen: false })} aria-label="Close chat">
            <Icon name="x" />
          </button>
        </div>
      </div>
      <div className="chat-body" ref={bodyRef}>
        {!chat.length && (
          <div className="msg assistant">
            Ask why a partner got their decision, or tell me what changed. I&apos;ll show who moves before anything is saved.
          </div>
        )}
        {chat.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.role === "assistant" ? <Linkify text={m.text} onId={(id) => (id.startsWith("TER") ? set({ tab: "territories", selected: null }) : openId(id))} /> : m.text}
            {m.role === "assistant" && m.source === "rules" && <div className="xs" style={{ opacity: 0.5, marginTop: 6 }}>rule-based reply (AI unavailable)</div>}
            {m.proposal && (
              <div className="proposal">
                <p className="eyebrow">{m.proposal.status === "applied" ? "Applied" : m.proposal.status === "discarded" ? "Discarded" : "Proposed change"}</p>
                {m.proposal.lines.map((l) => (
                  <div key={l} style={{ marginTop: 4 }}>
                    • {l}
                  </div>
                ))}
                {m.proposal.assumptions.map((a) => (
                  <div key={a} className="xs note-amber" style={{ marginTop: 4 }}>
                    Assumption: {a}
                  </div>
                ))}
                {m.proposal.errors.map((a) => (
                  <div key={a} className="xs note-red" style={{ marginTop: 4 }}>
                    Skipped: {a}
                  </div>
                ))}
                {m.proposal.edits.length > 0 && (
                  <>
                    <p className="eyebrow" style={{ marginTop: 10 }}>
                      {m.proposal.status === "applied" ? "What changed" : "What will change"}
                    </p>
                    <DiffList rows={m.proposal.impact} dark empty="No decision changes — only scores or details." />
                  </>
                )}
                {m.proposal.status === "pending" && m.proposal.edits.length > 0 && (
                  <div className="row" style={{ marginTop: 12 }}>
                    <button className="mini red" onClick={() => apply(m)}>
                      Apply
                    </button>
                    <button className="mini" onClick={() => patch(m.id, { proposal: { ...m.proposal!, status: "discarded" } })}>
                      Discard
                    </button>
                  </div>
                )}
              </div>
            )}
            {m.override && (
              <div className="proposal">
                <p className="eyebrow">{m.override.status === "applied" ? "Override saved" : m.override.status === "discarded" ? "Discarded" : "Team override"}</p>
                <div className="row wrap" style={{ marginTop: 6 }}>
                  {m.override.id} <Pill d={m.override.from as never} /> <Icon name="arrow" size={14} /> <Pill d={m.override.decision} />
                </div>
                <div className="xs" style={{ marginTop: 6, opacity: 0.8 }}>
                  Reason: {m.override.reason || "—"}
                </div>
                {m.override.status === "pending" && (
                  <div className="row" style={{ marginTop: 10 }}>
                    <button
                      className="mini red"
                      onClick={() => {
                        commitOverride(m.override!.id, { decision: m.override!.decision, reason: m.override!.reason || "Team decision in chat", at: new Date().toISOString() }, `Chat override: ${m.override!.id} → ${m.override!.decision}`);
                        patch(m.id, { override: { ...m.override!, status: "applied" } });
                        toast(`${m.override!.id} set to ${m.override!.decision}`);
                      }}
                    >
                      Confirm
                    </button>
                    <button className="mini" onClick={() => patch(m.id, { override: { ...m.override!, status: "discarded" } })}>
                      Discard
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="msg assistant">
            <span className="loading-dots">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
      </div>
      <div className="chat-foot">
        <div className="suggest">
          {suggestions.slice(0, 3).map((s) => (
            <button key={s} onClick={() => send(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <textarea
            rows={1}
            value={text}
            placeholder="Ask, or tell me what changed…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
          />
          <button className="round" type="submit" disabled={busy || !text.trim()} aria-label="Send">
            <Icon name="send" size={16} />
          </button>
        </form>
      </div>
    </aside>
  );
}
