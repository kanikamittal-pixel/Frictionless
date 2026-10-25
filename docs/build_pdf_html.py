"""Builds docs/criteria.html (then rendered to PDF by render_pdf.cjs).

Every number comes from docs/_data.json, which is dumped from the live engine
(rubric v1, Eyewear & optical · FOFO brand profile, sample batch).
"""
import json
import html
from pathlib import Path

ROOT = Path(__file__).parent
D = json.loads((ROOT / "_data.json").read_text())
R = D["rubric"]
B = D["brand"]
esc = html.escape

INK = "#0e0e0d"
MUTED = "#65655f"
ACC = "#2f5bff"
LINE = "#0e0e0d33"
PAPER = "#f4f4f0"
RAISED = "#ecece6"
DEC = {"Approve": "#1f7a4d", "Conditional": "#a3620a", "Hold": "#2a52f0", "Reject": "#c02b24"}


def pill(d, text=None):
    return f'<span class="pill" style="color:{DEC[d]}">{esc(text or ("On hold" if d == "Hold" else d))}</span>'


# ---------------------------------------------------------------- SVG helpers
def fo(x, y, w, h, inner, cls="box"):
    return f'<foreignObject x="{x}" y="{y}" width="{w}" height="{h}"><div xmlns="http://www.w3.org/1999/xhtml" class="{cls}">{inner}</div></foreignObject>'


def arrow(x1, y1, x2, y2, color=INK, dash=False, head=True):
    d = ' stroke-dasharray="4 4"' if dash else ""
    m = f' marker-end="url(#ah{"b" if color == ACC else ""})"' if head else ""
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="1.2"{d}{m}/>'


def path(dpath, color=INK, dash=False):
    d = ' stroke-dasharray="4 4"' if dash else ""
    return f'<path d="{dpath}" fill="none" stroke="{color}" stroke-width="1.2"{d} marker-end="url(#ah{"b" if color == ACC else ""})"/>'


DEFS = f'''<defs>
<marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" fill="{INK}"/></marker>
<marker id="ahb" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" fill="{ACC}"/></marker>
<pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="#0e0e0d0f" stroke-width="1"/></pattern>
</defs>'''


# ---------------------------------------------------------------- Diagram 1: system swimlane
def swimlane():
    cols = ["Trigger", "Input", "Context", "Processing", "Output", "Feedback", "Improve"]
    lanes = [
        ("Expansion team", "the user"),
        ("Outpost app", "browser · Next.js"),
        ("AI model", "Gemini Flash via OpenRouter"),
        ("Decision engine", "deterministic code"),
        ("Database", "Postgres (Neon)"),
    ]
    W, H = 1060, 640
    lx, top = 128, 36
    cw = (W - lx - 6) / len(cols)
    lh = (H - top - 8) / len(lanes)
    s = [f'<svg viewBox="0 0 {W} {H}" width="100%" xmlns="http://www.w3.org/2000/svg">', DEFS]
    for i, (name, sub) in enumerate(lanes):
        y = top + i * lh
        s.append(f'<rect x="0" y="{y}" width="{W}" height="{lh}" fill="{"#ffffff" if i % 2 else "#f7f7f3"}"/>')
        s.append(fo(6, y + 8, lx - 14, lh - 16, f"<b>{esc(name)}</b><br/><span class='m'>{esc(sub)}</span>", "lane"))
    for j, c in enumerate(cols):
        x = lx + j * cw
        s.append(f'<line x1="{x}" y1="{top}" x2="{x}" y2="{H - 8}" stroke="{LINE}" stroke-width="0.8"/>')
        s.append(f'<text x="{x + cw / 2}" y="{top - 14}" text-anchor="middle" class="colh">{esc(c.upper())}</text>')
    s.append(f'<line x1="0" y1="{top}" x2="{W}" y2="{top}" stroke="{INK}" stroke-width="1"/>')

    bw, bh = cw - 14, lh - 22

    def B(col, lane, text, kind="box"):
        x = lx + col * cw + 7
        y = top + lane * lh + 11
        s.append(fo(x, y, bw, bh, text, kind))
        return (x, y)

    def mid(col, lane, side):
        x = lx + col * cw + 7
        y = top + lane * lh + 11
        return {"l": (x, y + bh / 2), "r": (x + bw, y + bh / 2), "t": (x + bw / 2, y), "b": (x + bw / 2, y + bh)}[side]

    B(0, 0, "<b>Sets up &amp; uploads</b>Picks brand industry and business model; uploads Sheets 1 and 2.")
    B(1, 1, "<b>Reads the file</b>Finds sheets by headers; normalises messy cells; data checks.")
    B(1, 2, "<b>Reads free text</b>Relevance, urgency, red flags, contradictions, values for blank cells.", "box ai")
    B(2, 1, "<b>Builds the map</b>Pin → territory, usable slots, existing stores, localities.")
    B(2, 2, "<b>Places pins</b>Locality type for pins not on the built-in map (labelled estimate).", "box ai")
    B(2, 4, "<b>Loads rubric</b>Latest approved version: weights, tier bars.", "box db")
    B(3, 3, "<b>Decides</b>Knockouts → 100-point score → one store per pin → slots → decision.", "box eng")
    B(4, 1, "<b>Shows results</b>Overview, partner pages, onboarding plan, data checks.")
    B(4, 2, "<b>Explains</b>Plain-language reason, partner message, plan in Kannada / Hindi. Never re-scores.", "box ai")
    B(4, 0, "<b>Reviews &amp; decides</b>Sees every call; overrides with a reason.", "box gate")
    B(4, 4, "<b>Saves batch</b>Decisions, scores, reasons, time.", "box db")
    B(5, 0, "<b>Asks or updates</b>“Why is APP-007 on hold?” “APP-012 found a space.”")
    B(5, 2, "<b>Q&amp;A agent</b>Answers from saved scores; turns new facts into field edits.", "box ai")
    B(5, 3, "<b>Re-runs</b>Whole batch; before → after for everyone, incl. knock-on.", "box eng")
    B(5, 4, "<b>Change log</b>Append-only; every edit and override.", "box db")
    B(6, 1, "<b>Insights</b>All batches + recorded store outcomes.")
    B(6, 2, "<b>Pattern finder</b>Proposes new weights / tier bars.", "box ai")
    B(6, 0, "<b>Approves rubric</b>Previews impact; approves vN+1.", "box gate")
    B(6, 4, "<b>Saves rubric vN+1</b>Next upload reads it.", "box db")

    def A(a, b, col=INK, dash=False):
        s.append(arrow(*a, *b, color=col, dash=dash))

    A(mid(0, 0, "b"), (mid(1, 1, "l")[0] - 2, mid(1, 1, "l")[1]))
    s.append(path(f"M{mid(0,0,'b')[0]},{mid(0,0,'b')[1]} L{mid(0,0,'b')[0]},{mid(1,1,'l')[1]} L{mid(1,1,'l')[0]-2},{mid(1,1,'l')[1]}"))
    s.pop(-2)
    A(mid(1, 1, "b"), mid(1, 2, "t"), ACC)
    A(mid(1, 1, "r"), mid(2, 1, "l"))
    A(mid(2, 1, "b"), mid(2, 2, "t"), ACC)
    s.append(path(f"M{mid(2,1,'r')[0]},{mid(2,1,'r')[1]} L{mid(3,3,'t')[0]-28},{mid(2,1,'r')[1]} L{mid(3,3,'t')[0]-28},{mid(3,3,'t')[1]-2}"))
    s.append(path(f"M{mid(2,4,'r')[0]},{mid(2,4,'r')[1]} L{mid(3,3,'b')[0]},{mid(2,4,'r')[1]} L{mid(3,3,'b')[0]},{mid(3,3,'b')[1]+2}", dash=True))
    s.append(path(f"M{mid(3,3,'t')[0]+28},{mid(3,3,'t')[1]} L{mid(3,3,'t')[0]+28},{mid(4,1,'l')[1]+18} L{mid(4,1,'l')[0]-2},{mid(4,1,'l')[1]+18}"))
    A(mid(4, 1, "t"), mid(4, 0, "b"))
    A(mid(4, 1, "b"), mid(4, 2, "t"), ACC)
    s.append(path(f"M{mid(3,3,'r')[0]},{mid(3,3,'r')[1]+14} L{mid(4,4,'t')[0]},{mid(3,3,'r')[1]+14} L{mid(4,4,'t')[0]},{mid(4,4,'t')[1]-2}"))
    A(mid(4, 0, "r"), mid(5, 0, "l"))
    s.append(path(f"M{mid(5,0,'b')[0]},{mid(5,0,'b')[1]} L{mid(5,0,'b')[0]},{mid(5,2,'t')[1]-2}", ACC))
    A(mid(5, 2, "b"), mid(5, 3, "t"))
    A(mid(5, 3, "b"), mid(5, 4, "t"))
    A(mid(5, 4, "r"), (mid(6, 4, "l")[0] - 2, mid(6, 4, "l")[1]), dash=True)
    s.append(path(f"M{mid(5,4,'r')[0]+8},{mid(5,4,'r')[1]} L{mid(5,4,'r')[0]+8},{mid(6,1,'l')[1]} L{mid(6,1,'l')[0]-2},{mid(6,1,'l')[1]}", dash=True))
    A(mid(6, 1, "b"), mid(6, 2, "t"), ACC)
    A(mid(6, 1, "t"), mid(6, 0, "b"))
    s.append(path(f"M{mid(6,0,'r')[0]},{mid(6,0,'r')[1]} L{W-4},{mid(6,0,'r')[1]} L{W-4},{mid(6,4,'r')[1]} L{mid(6,4,'r')[0]+2},{mid(6,4,'r')[1]}"))
    # next upload reads new rubric
    yb = H - 2
    s.append(f'<path d="M{mid(6,4,"b")[0]},{mid(6,4,"b")[1]} L{mid(6,4,"b")[0]},{yb-4} L{mid(2,4,"b")[0]},{yb-4} L{mid(2,4,"b")[0]},{mid(2,4,"b")[1]+2}" fill="none" stroke="{ACC}" stroke-width="1.2" stroke-dasharray="4 4" marker-end="url(#ahb)"/>')
    s.append(f'<text x="{(mid(6,4,"b")[0]+mid(2,4,"b")[0])/2}" y="{yb-8}" text-anchor="middle" class="mono" fill="{ACC}">NEXT UPLOAD READS THE NEW RUBRIC</text>')
    s.append("</svg>")
    return "".join(s)


# ---------------------------------------------------------------- Diagram 2: decision pipeline
def pipeline():
    steps = [
        ("01", "Read the workbook", "Sheets found by their headers (not names); header row may sit below a title. Sheet 3 built in if absent."),
        ("02", "Normalise every cell", "“Rs 25,00,000” → ₹25L · “8+” → 8 · “GF” → Ground · “Jan 2027” → 3 months · IDs → APP-007."),
        ("03", "Read the free text", "AI tags relevance, urgency, red flags, contradictions; fills blank cells the notes state. Rules if AI fails."),
        ("04", "Build the territory map", "Pin → territory. Usable slots = min(open slots, pins without a store). Overlaps and wrong tiers flagged."),
        ("05", "Phase 1 territory gate", "If any application is inside a territory → strict: outside pins are held. If none are → fallback: all continue with a penalty flag."),
        ("06", "Knockouts", "Checked in order before scoring (see right)."),
        ("07", "Score 13 metrics, 0–10", "Partner fit 50% + location fit 50% → 100 points, shown as five dimensions."),
        ("08", "Screen before allocation", "Missing data, legal risk, form-vs-notes conflict, duplicate, low score, too many gaps."),
        ("09", "One store per pin", "Best score keeps each pin. A strong runner-up is re-scored on a free pin in the same territory."),
        ("10", "Fill territory slots", "Rank by score; tie-break capital → site → sooner launch → lower ID."),
        ("11", "Decide and explain", "Decision, conditions, competing partner, simulated path to yes, onboarding plan."),
    ]
    outs = {
        "06": [("Reject", "Withdrawn by applicant"), ("Hold", "City and pin disagree"), ("Reject", "Pin already has a store"), ("Hold", "Pin outside territories / 7 cities"), ("Reject", "Territory has no usable slot"), ("Reject", f"Capital < {int(R['capitalFloor']*100)}% of tier minimum")],
        "08": [("Hold", "Missing / conflicting data"), ("Hold", "Legal or ownership dispute"), ("Hold", "Duplicate submission"), ("Reject", f"Score < {R['rejectBelow']}"), ("Hold", f"Score {R['rejectBelow']}–{R['conditionalMin']} (review band)"), ("Hold", "3+ major gaps (not launch-ready)")],
        "09": [("Hold", "Lost the pin, no free pin left")],
        "10": [("Hold", "Waitlisted — slots went to higher scores")],
        "11": [("Approve", f"Slot won · score ≥ tier bar · nothing to close"), ("Conditional", "Slot won · conditions (slot held 60 days)")],
    }
    W = 1000
    bx, bw = 10, 540
    ox, ow = 610, 380
    y = 10
    rows = []
    for k, t, d in steps:
        n = len(outs.get(k, []))
        bh = 78
        oh = max(bh, n * 32 + 10)
        rows.append((k, t, d, y, bh, oh))
        y += oh + 18
    H = y
    s = [f'<svg viewBox="0 0 {W} {H}" width="100%" xmlns="http://www.w3.org/2000/svg">', DEFS]
    for i, (k, t, d, yy, bh, oh) in enumerate(rows):
        cy = yy + oh / 2
        kind = "box eng" if k in ("06", "07", "08", "09", "10", "11") else ("box ai" if k == "03" else "box")
        by = yy + (oh - bh) / 2
        s.append(fo(bx, by, bw, bh, f"<span class='k'>{k}</span><b>{esc(t)}</b>{esc(d)}", kind + " flow"))
        if i < len(rows) - 1:
            nk, nt, nd, ny, nbh, noh = rows[i + 1]
            s.append(arrow(bx + bw / 2, by + bh, bx + bw / 2, ny + (noh - nbh) / 2 - 2))
        o = outs.get(k, [])
        if o:
            s.append(f'<line x1="{bx+bw}" y1="{cy}" x2="{ox-24}" y2="{cy}" stroke="{INK}" stroke-width="1.2"/>')
            top_y = yy + (oh - len(o) * 32) / 2 + 4
            s.append(f'<line x1="{ox-24}" y1="{top_y+12}" x2="{ox-24}" y2="{top_y+(len(o)-1)*32+12}" stroke="{INK}" stroke-width="1.2"/>')
            for j, (dec, why) in enumerate(o):
                py = top_y + j * 32
                s.append(arrow(ox - 24, py + 12, ox - 4, py + 12))
                s.append(fo(ox - 20, py, ow + 20, 28, f"{pill(dec)} <span>{esc(why)}</span>", "out"))
    s.append("</svg>")
    return "".join(s)


# ---------------------------------------------------------------- Diagram 3: allocation example TER-03
def allocation():
    W, H = 1000, 330
    s = [f'<svg viewBox="0 0 {W} {H}" width="100%" xmlns="http://www.w3.org/2000/svg">', DEFS]
    s.append(f'<rect x="0" y="0" width="{W}" height="{H}" fill="url(#grid)"/>')
    s.append(f'<text x="16" y="24" class="mono">TER-03 · MYSURU · TIER 2 · HIGH PRIORITY · 2 OPEN SLOTS · 4 PINS (570009 HAS STORE ST-06) → 2 USABLE SLOTS</text>')
    pins = [
        ("570001", "APP-026 · 92.3  vs  APP-001 · 78.4", "APP-026 keeps the pin", "Approve"),
        ("570002", "APP-005 · 68.1 (upper floor, ₹3L gap)", "pin holder, ranks 3rd", "Hold"),
        ("570008", "free — APP-024 asked but has no investment yet", "APP-001 re-scored here: 78.4", "Conditional"),
        ("570009", "APP-004 · 83.4", "store ST-06 already here", "Reject"),
    ]
    for i, (p, who, note, dec) in enumerate(pins):
        x = 16 + i * 246
        s.append(fo(x, 46, 232, 118, f"<span class='mono'>PIN {p}</span><b>{esc(who)}</b><span class='m'>{esc(note)}</span>", "box"))
    s.append(fo(16, 196, 968, 120, (
        "<b>Rank for the 2 usable slots</b>"
        "<div class='rank'><span>1</span> APP-026 · 92.3 · own pin 570001 → " + pill("Approve") + "</div>"
        "<div class='rank'><span>2</span> APP-001 · 78.4 · lost 570001, moved to free pin 570008 → " + pill("Conditional", "Conditional (relocate)") + "</div>"
        "<div class='rank'><span>3</span> APP-005 · 68.1 · own pin 570002 → " + pill("Hold", "Waitlisted #1") + "  ·  APP-004 rejected earlier (store pin)</div>"
    ), "box eng"))
    s.append("</svg>")
    return "".join(s)


# ---------------------------------------------------------------- Diagram 4: feedback & improve loop
def feedback():
    W, H = 1000, 470
    s = [f'<svg viewBox="0 0 {W} {H}" width="100%" xmlns="http://www.w3.org/2000/svg">', DEFS]
    def b(x, y, w, h, t, k="box"):
        s.append(fo(x, y, w, h, t, k))
    b(10, 20, 200, 70, "<b>Team types a message</b>question, new fact, or override")
    b(260, 20, 220, 70, "<b>AI reads intent</b>question · update · override · unclear (rules if AI is down)", "box ai")
    b(540, 0, 210, 56, "<b>Question</b>answer from saved scores, cite IDs", "box ai")
    b(540, 70, 210, 56, "<b>Override</b>team confirms; reason required", "box gate")
    b(780, 0, 210, 56, "<b>Answer shown</b>links open the partner", "box")
    b(780, 70, 210, 56, "<b>Logged</b>survives re-runs; engine call kept", "box db")
    b(260, 150, 220, 74, "<b>Update → field edits</b>e.g. space: Not yet identified → Rented; floor → Ground; assumptions stated", "box ai")
    b(540, 150, 210, 74, "<b>Validate &amp; normalise</b>allowed values, no-op edits dropped, stale note conflicts cleared", "box")
    b(780, 150, 210, 74, "<b>Preview</b>re-run whole batch → before → after, incl. knock-on", "box eng")
    b(780, 250, 210, 60, "<b>Team clicks Apply</b>(decision gate)", "box gate")
    b(540, 250, 210, 60, "<b>Change log</b>append-only, undoable", "box db")
    b(260, 250, 220, 60, "<b>Decisions update</b>for this partner and rivals", "box eng")
    s.append(arrow(210, 55, 258, 55))
    s.append(path("M480,45 L512,45 L512,28 L538,28"))
    s.append(path("M480,62 L512,62 L512,98 L538,98"))
    s.append(path("M370,90 L370,148"))
    s.append(arrow(750, 28, 778, 28))
    s.append(arrow(750, 98, 778, 98))
    s.append(arrow(480, 187, 538, 187))
    s.append(arrow(750, 187, 778, 187))
    s.append(arrow(885, 224, 885, 248))
    s.append(arrow(780, 280, 752, 280))
    s.append(arrow(540, 280, 482, 280))
    # improve loop
    y0 = 350
    s.append(f'<line x1="10" y1="{y0-14}" x2="990" y2="{y0-14}" stroke="{LINE}"/>')
    s.append(f'<text x="10" y="{y0}" class="mono">IMPROVE LOOP</text>')
    b(10, y0 + 12, 170, 80, "<b>Every batch saved</b>scores, decisions, change log", "box db")
    b(205, y0 + 12, 170, 80, "<b>Outcomes recorded</b>opened? on time? payback?", "box gate")
    b(400, y0 + 12, 170, 80, "<b>Insights</b>what separates decisions; demand vs slots", "box")
    b(595, y0 + 12, 170, 80, "<b>Pattern finder</b>proposes ±5-pt weight changes, cites evidence", "box ai")
    b(790, y0 + 12, 200, 80, "<b>Team previews &amp; approves</b>rubric vN+1 → next upload", "box gate")
    for x in (180, 375, 570, 765):
        s.append(arrow(x, y0 + 52, x + 23, y0 + 52))
    s.append("</svg>")
    return "".join(s)


# ---------------------------------------------------------------- tables
def metric_tables():
    out = []
    for d in D["dims"]:
        out.append(f'<h3 class="dimh"><span>{esc(d["label"])}</span><span class="mono">{d["points"]} PTS · {esc(D["blurb"][d["key"]])}</span></h3>')
        for m in d["metrics"]:
            rows = "".join(f"<tr><td>{esc(c)}</td><td class='v'>{esc(v)}</td></tr>" for c, v in m["levels"])
            out.append(
                f'<div class="metric"><div class="mh"><b>{esc(m["label"])}</b><span class="mono">{m["points"]} pts · {m["weight"]}% of {m["group"]} fit</span></div>'
                f'<p>{esc(m["what"])}</p><table class="lv">{rows}</table></div>'
            )
    return "".join(out)


def industries_table():
    rows = "".join(
        f"<tr><td>{esc(i['label'])}</td><td class='n'>₹{i['capex']['Tier 1']}L / ₹{i['capex']['Tier 2']}L / ₹{i['capex']['Tier 3']}L</td>"
        f"<td class='n'>{i['sqft']['idealMin']}–{i['sqft']['idealMax']}</td><td>{i['footfall']}</td><td>{'yes' if i['ground'] else 'no'}</td>"
        f"<td class='n'>{i['lead']['withSpace']} / {i['lead']['withoutSpace']} mo</td><td class='n'>{i['staff']}</td></tr>"
        for i in D["industries"]
    )
    return f"<table class='t'><thead><tr><th>Industry</th><th>Partner capital T1 / T2 / T3</th><th>Ideal sq ft</th><th>Walk-in reliance</th><th>Ground floor needed</th><th>Lead time (space / none)</th><th>Staff</th></tr></thead><tbody>{rows}</tbody></table>"


def models_table():
    eff = {
        "fofo": "Partner invests and runs it. All weights as listed.",
        "foco": "Brand runs it: operating-experience weight halves and moves to financial readiness; capital +10%; margin ×0.75 (revenue share).",
        "sis": "Brand corner inside the partner's shop: space ≈ ¼, capital ×0.3, 2 staff, needs a running shop (else a major gap).",
        "micro": "Partner lends space (I Have Space style): 120–300 sq ft, capital ×0.12, needs a running shop.",
    }
    rows = "".join(f"<tr><td><b>{esc(m['label'])}</b><br/><span class='m'>{esc(m['hint'])}</span></td><td>{esc(eff[m['key']])}</td></tr>" for m in D["models"])
    return f"<table class='t'><thead><tr><th style='width:38%'>Business model</th><th>What it changes</th></tr></thead><tbody>{rows}<tr><td><b>Other (free text)</b></td><td>AI picks the closest preset and adjusts the numbers; the team reviews them before upload.</td></tr></tbody></table>"


def worked():
    b4, af = D["before"], D["after"]
    def dimrow(a, b):
        return "".join(f"<tr><td>{esc(x[0])}</td><td class='n'>{x[1]}</td><td class='n'>{y[1]}</td></tr>" for x, y in zip(a, b))
    fac = "".join(f"<tr><td>{esc(f[0])}</td><td class='n'>{f[1]}</td><td class='n'>{f[2]}</td><td>{esc(f[3])}</td></tr>" for f in b4["factors"])
    conds = "".join(f"<li>{esc(c)}</li>" for c in b4["conditions"])
    paths = "".join(f"<li>{esc(p['label'])} → <b>{p['becomes']}</b> ({p['score']})</li>" for p in b4["paths"])
    wd = "".join(f"<tr><td>{esc(r[0])}</td><td>{pill(r[1])}</td><td>{pill(r[2]) if 'Withdrawn' not in r[3] else '<span class=pill style=color:#65655f>Withdrawn</span>'}</td><td>{esc(r[3])}</td></tr>" for r in D["withdraw"])
    return f"""
<p><b>{esc(b4['id'])} · {esc(b4['name'])}</b> — Davanagere 577002 (TER-07, Tier 3, High priority, 3 slots). ₹18L to invest, 2 years as an eyewear-chain sales manager, no space yet, wants to open in 2 months, prefers Kannada. Notes: “Looking for a shop near the PB Road market”.</p>
<div class="two">
<div><h4>Decision on upload</h4><p>{pill(b4['decision'])} <b>{b4['score']}/100</b> (partner {b4['P']} · location {b4['L']})</p><p class="m">{esc(b4['headline'])}</p>
<p><b>Conditions</b></p><ul>{conds}</ul><p><b>Path to yes (simulated)</b></p><ul>{paths}</ul></div>
<div><h4>After “APP-012 has found a 450 sq ft ground-floor space”</h4><p>{pill(af['decision'])} <b>{af['score']}/100</b></p><p class="m">{esc(af['headline'])}</p>
<table class="t"><thead><tr><th>Dimension</th><th>Before</th><th>After</th></tr></thead><tbody>{dimrow(b4['dims'], af['dims'])}</tbody></table>
<p class="m">Remaining condition: {esc(af['conditions'][0] if af['conditions'] else '—')}</p></div>
</div>
<h4>All 13 metrics on upload</h4>
<table class="t small"><thead><tr><th>Metric</th><th>Weight</th><th>Score /10</th><th>Evidence the engine recorded</th></tr></thead><tbody>{fac}</tbody></table>
<h4>Knock-on example: “APP-019 has withdrawn”</h4>
<table class="t small"><thead><tr><th>ID</th><th>Before</th><th>After</th><th>Why</th></tr></thead><tbody>{wd}</tbody></table>
"""


def plan_table():
    rows = "".join(f"<tr><td>{esc(p[0])}</td><td class='n'>{esc(p[1])}</td><td>{esc(p[2])}</td><td>{esc(p[3])}</td></tr>" for p in D["plan"])
    return f"<table class='t small'><thead><tr><th>Phase</th><th>Date</th><th>Step</th><th>Owner</th></tr></thead><tbody>{rows}</tbody></table><p class='m'>{esc(D['planNote'])}</p>"


def batch_table():
    c = D["summary"]["counts"]
    rows = "".join(
        f"<tr><td><b>{esc(t['id'])}</b> {esc(t['city'])}</td><td>{esc(t['prio'] or '—')}</td><td class='n'>{t['slots']} → {t['cap']}</td><td>{esc(', '.join(t['alloc']) or '—')}</td><td>{esc(', '.join(t['wait']) or '—')}</td><td class='m'>{esc(t['note'])}</td></tr>"
        for t in D["territories"]
    )
    return f"""<p>Sample batch (28 rows seeded with the brief's edge cases): {pill('Approve')} {c['Approve']} · {pill('Conditional')} {c['Conditional']} · {pill('Hold')} {c['Hold']} · {pill('Reject')} {c['Reject']}. {D['summary']['slotsFilled']} of {D['summary']['slotsOpen']} usable slots filled; {D['summary']['contestedPins']} pins contested.</p>
<table class="t small"><thead><tr><th>Territory</th><th>Priority</th><th>Slots → usable</th><th>Allocated</th><th>Waitlist</th><th>Note</th></tr></thead><tbody>{rows}</tbody></table>"""


# ---------------------------------------------------------------- page
gates_html = "".join(f"<li><b>{esc(t)}</b> — {esc(d)}</li>" for t, d in D["gates"])
bands_html = "".join(f"<tr><td>{pill(d)}</td><td>{esc(t)}</td></tr>" for d, t in D["bands"])
dims_rows = "".join(f"<tr><td><b>{esc(d['label'])}</b></td><td>{esc(D['blurb'][d['key']])}</td><td>{esc(', '.join(m['label'] for m in d['metrics']))}</td><td class='n'>{d['points']}</td></tr>" for d in D["dims"])

CSS = f"""
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap');
@page {{ size: A4; margin: 16mm 15mm 18mm; }}
@page wide {{ size: A4 landscape; margin: 12mm 12mm 14mm; }}
* {{ box-sizing: border-box; }}
body {{ font-family: Geist, system-ui, sans-serif; color: {INK}; font-size: 10.2pt; line-height: 1.5; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
h1, h2, h3, h4 {{ font-weight: 500; letter-spacing: -0.03em; margin: 0; }}
h2 {{ font-size: 24pt; margin: 0 0 10px; line-height: 1.05; }}
h3 {{ font-size: 13pt; margin: 18px 0 6px; }}
h4 {{ font-size: 11pt; margin: 14px 0 6px; }}
p {{ margin: 0 0 8px; }}
ul {{ margin: 4px 0 10px; padding-left: 18px; }} li {{ margin: 2px 0; }}
.mono, .colh {{ font-family: 'Geist Mono', monospace; font-size: 7.6pt; letter-spacing: .02em; text-transform: uppercase; color: {MUTED}; }}
.colh {{ fill: {INK}; font-size: 9px; }}
text.mono {{ font-size: 9.5px; fill: {MUTED}; }}
.m {{ color: {MUTED}; }}
.sec {{ break-before: page; }}
.sec-h {{ display: flex; justify-content: space-between; border-top: 1px solid {INK}; padding-top: 6px; margin-bottom: 18px; font-family: 'Geist Mono', monospace; font-size: 8pt; text-transform: uppercase; letter-spacing: .02em; }}
.sec-h span:last-child {{ color: {MUTED}; }}
.lead {{ font-size: 12.5pt; color: #3a3a36; letter-spacing: -0.01em; line-height: 1.45; max-width: 160mm; }}
.wide {{ page: wide; break-before: page; }}
.pill {{ display: inline-block; border: 1px solid currentColor; border-radius: 999px; padding: 0 7px; font-family: 'Geist Mono', monospace; font-size: 7pt; text-transform: uppercase; letter-spacing: .02em; line-height: 1.7; white-space: nowrap; }}
table.t {{ width: 100%; border-collapse: collapse; margin: 6px 0 12px; }}
table.t th {{ text-align: left; font-family: 'Geist Mono', monospace; font-size: 7pt; text-transform: uppercase; color: {MUTED}; font-weight: 400; padding: 0 6px 5px; border-bottom: 1px solid {INK}; }}
table.t td {{ padding: 5px 6px; border-bottom: 1px solid {LINE}; vertical-align: top; }}
table.t td.n {{ font-family: 'Geist Mono', monospace; font-size: 8.4pt; white-space: nowrap; }}
table.small td {{ font-size: 8.6pt; }}
table.tight td {{ padding: 3px 6px; }}
.two {{ display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }}
.fig {{ border: 1px solid {LINE}; border-radius: 4px; padding: 10px; background: #fff; break-inside: avoid; }}
.figcap {{ font-family: 'Geist Mono', monospace; font-size: 7.4pt; color: {MUTED}; text-transform: uppercase; margin: 6px 0 14px; }}
.box {{ height: 100%; border: 1px solid {INK}; border-radius: 4px; background: #fff; padding: 6px 7px; font-size: 8.2px; line-height: 1.32; color: #3a3a36; overflow: hidden; }}
.box b {{ display: block; font-size: 9.4px; font-weight: 600; color: {INK}; margin-bottom: 2px; letter-spacing: -0.01em; }}
.box.ai {{ border-color: {ACC}; background: #eef1ff; }}
.box.eng {{ background: {PAPER}; border-width: 1.5px; }}
.box.db {{ border-style: dashed; background: #fafaf7; }}
.box.gate {{ border-color: #c47a12; background: #fff6e8; }}
.box.flow {{ font-size: 10px; padding: 8px 10px 8px 46px; position: relative; }}
.box.flow b {{ font-size: 11.5px; }}
.box .k {{ position: absolute; left: 10px; top: 9px; font-family: 'Geist Mono', monospace; font-size: 9px; color: {ACC}; }}
.box .mono {{ font-size: 8px; display: block; margin-bottom: 4px; }}
.box .rank {{ font-size: 10px; margin-top: 6px; color: {INK}; }}
.box .rank span {{ font-family: 'Geist Mono', monospace; color: {ACC}; margin-right: 6px; }}
.out {{ font-size: 9.6px; color: #3a3a36; display: flex; gap: 8px; align-items: center; white-space: nowrap; }}
.out .pill {{ font-size: 7.6px; min-width: 86px; text-align: center; }}
.lane {{ font-size: 10px; line-height: 1.3; }} .lane b {{ font-size: 11px; font-weight: 600; }} .lane .m {{ font-size: 8.4px; }}
.wide .fig {{ width: 88%; margin: 0 auto; }}
.wide .legend, .wide .figcap {{ width: 88%; margin-left: auto; margin-right: auto; }}
h2, h3, h4 {{ break-after: avoid; }}
.fig.big .box {{ font-size: 10.6px; line-height: 1.32; }}
.fig.big .box b {{ font-size: 12px; }}
.fig.big .box .mono {{ font-size: 9.4px; }}
.fig.big .box .rank {{ font-size: 12.4px; }}
.fig.big .pill {{ font-size: 9px; }}
.fig.big text.mono {{ font-size: 11px; }}
.flowfig .box.flow {{ font-size: 12.2px; line-height: 1.32; padding-left: 52px; }}
.flowfig .box.flow b {{ font-size: 14px; }}
.flowfig .box .k {{ font-size: 11px; }}
.flowfig .out {{ font-size: 12.4px; }}
.flowfig .out .pill {{ font-size: 9.4px; min-width: 104px; }}
.legend {{ display: flex; gap: 16px; flex-wrap: wrap; font-size: 8.4pt; color: {MUTED}; margin-top: 8px; }}
.legend i {{ display: inline-block; width: 14px; height: 10px; border: 1px solid {INK}; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }}
.dimh {{ display: flex; justify-content: space-between; align-items: baseline; border-top: 1px solid {INK}; padding-top: 8px; margin-top: 20px; font-size: 15pt; }}
.dimh .mono {{ font-size: 7.4pt; }}
.metric {{ break-inside: avoid; margin: 10px 0 14px; padding-left: 12px; border-left: 2px solid {ACC}; }}
.metric .mh {{ display: flex; justify-content: space-between; align-items: baseline; }}
.metric .mh b {{ font-weight: 600; font-size: 10.5pt; }}
.metric p {{ color: #3a3a36; margin: 3px 0 5px; }}
table.lv {{ width: 100%; border-collapse: collapse; }}
table.lv td {{ font-size: 8.8pt; padding: 3px 0; border-top: 1px solid {LINE}; }}
table.lv td.v {{ text-align: right; font-family: 'Geist Mono', monospace; font-size: 8.4pt; width: 70px; }}
.cover {{ height: 255mm; display: flex; flex-direction: column; justify-content: space-between; position: relative; }}
.cover h1 {{ font-size: 46pt; letter-spacing: -0.055em; line-height: 0.95; }}
.cover .dot {{ color: {ACC}; }}
.toc {{ columns: 2; column-gap: 24px; font-size: 10pt; }}
.toc div {{ display: flex; gap: 10px; padding: 4px 0; border-bottom: 1px solid {LINE}; break-inside: avoid; }}
.toc .mono {{ color: {ACC}; }}
.callout {{ border-left: 2px solid {ACC}; padding: 4px 0 4px 12px; margin: 10px 0; color: #3a3a36; }}
.grid-bg {{ background-image: linear-gradient({'#0e0e0d0d'} 1px, transparent 1px), linear-gradient(90deg, {'#0e0e0d0d'} 1px, transparent 1px); background-size: 6mm 6mm; }}
"""

TOC = [
    ("01", "What Outpost does"), ("02", "System flow — the swimlane"), ("03", "Inputs: the two trigger choices and three sheets"),
    ("04", "Reading messy data"), ("05", "Decision pipeline — step by step"), ("06", "Scoring rubric: 5 dimensions, 13 metrics"),
    ("07", "From score to decision"), ("08", "Allocation: one store per pin"), ("09", "Outputs: plan, payback, explanation"),
    ("10", "Feedback and improve loops"), ("11", "Where AI is used — and where it isn't"), ("12", "Worked example and sample batch"),
    ("13", "Assumptions and limits"),
]

HTML = f"""<!doctype html><html><head><meta charset="utf-8"><title>Outpost — Decision criteria and system flow</title><style>{CSS}</style></head><body>

<section class="cover grid-bg" style="padding:8mm">
  <div style="display:flex;justify-content:space-between" class="mono"><span>OP<span style="color:{ACC}">.</span> Outpost · Franchise partner engine</span><span>Ops Hackathon · Case 1</span></div>
  <div>
    <p class="mono" style="color:{ACC}">Design document · v1 · 25 Oct 2026</p>
    <h1>Decision criteria<br/>and system flow<span class="dot">.</span></h1>
    <p class="lead" style="margin-top:16px">How Outpost reads franchise applications, scores every partner out of 100, gives each territory slot to the best partner, and explains the decision — with every rule, weight and threshold the engine uses.</p>
  </div>
  <div>
    <div class="toc">{''.join(f'<div><span class="mono">{n}</span><span>{esc(t)}</span></div>' for n, t in TOC)}</div>
    <p class="mono" style="margin-top:14px">Numbers shown for rubric v{R['version']} and the brand profile “{esc(B['industry'])} · FOFO”. They change when the brand or the rubric changes.</p>
  </div>
</section>

<section class="sec">
  <div class="sec-h"><span>[01] What Outpost does</span><span>Overview</span></div>
  <h2>Every application, decided — with a reason.</h2>
  <p class="lead">The expansion team picks the brand's industry and business model and uploads the applications and territories sheets. For every partner Outpost returns <b>Approve, Conditional, Hold or Reject</b>, the reason, the conditions to close, who they competed with, a simulated “path to yes”, and a dated onboarding plan in the partner's language. The team can then ask why, or give new information and see exactly who moves before anything is saved.</p>
  <h3>Design principles</h3>
  <table class="t"><tbody>
    <tr><td style="width:34%"><b>The engine decides; the AI never scores</b></td><td>Decisions come from deterministic code — the same file always gives the same answer. The AI reads messy text, explains, translates and turns chat into edits.</td></tr>
    <tr><td><b>Data problems → Hold, not Reject</b></td><td>A blank amount or a city/pin conflict costs the partner one question, not their application.</td></tr>
    <tr><td><b>One store per pin, always</b></td><td>Existing stores included. Usable slots are capped by pins that are still free.</td></tr>
    <tr><td><b>Best partner wins the slot</b></td><td>A strong runner-up for a pin is re-scored on a free pin in the same territory instead of being thrown away.</td></tr>
    <tr><td><b>The team decides</b></td><td>Overrides need a reason; rubric changes are previewed and approved as new versions; every change is logged and undoable.</td></tr>
    <tr><td><b>Show raw values, not just scores</b></td><td>“₹18L vs Tier 3 minimum ₹20L (0.90×) · batch median ₹30L” — every number is traceable.</td></tr>
  </tbody></table>
  <h3>Decision vocabulary</h3>
  <table class="t"><tbody>{bands_html}</tbody></table>
</section>

<section class="wide">
  <div class="sec-h"><span>[02] System flow — the swimlane</span><span>Fig. 01</span></div>
  <div class="fig">{swimlane()}</div>
  <div class="legend"><span><i></i>App step</span><span><i style="border-color:{ACC};background:#eef1ff"></i>AI step</span><span><i style="background:{PAPER};border-width:1.5px"></i>Decision engine</span><span><i style="border-style:dashed"></i>Database</span><span><i style="border-color:#c47a12;background:#fff6e8"></i>Decision gate — the team decides</span><span style="color:{ACC}">- - → AI handoff / next upload</span></div>
  <p class="figcap">Fig. 01 · Who does what, from upload to an improved rubric. The build tool (Claude Code) wrote the code and is never used while the app runs.</p>
</section>

<section class="sec">
  <div class="sec-h"><span>[03] Inputs</span><span>Trigger · Sheets 1–3</span></div>
  <h2>Two choices and three sheets.</h2>
  <p>Before uploading, the team chooses the brand's <b>industry</b> and <b>business model</b>. Together they set every brand-specific number in the rubric: how much a partner must invest per city tier, the right space size, whether walk-ins (and so the ground floor) matter, which past businesses count as relevant, lead times and the training plan.</p>
  <h3>Industry presets</h3>
  {industries_table()}
  <h3>Business models</h3>
  {models_table()}
  <h3>The sheets</h3>
  <table class="t small"><thead><tr><th>Sheet</th><th>Columns read</th><th>Notes</th></tr></thead><tbody>
    <tr><td><b>1 · Applications</b></td><td>Application ID · Applicant name · City · State · Pin code · Investment capacity (₹ lakh) · Retail experience (years) · Current / past business · Space available · Space size (sq ft) · Floor · Target launch (months) · Preferred language · Notes from applicant</td><td>Columns matched by meaning; “City · State · Pin code” may be one column.</td></tr>
    <tr><td><b>2 · Territories</b></td><td>Territory ID · City · State · Pin codes covered · City tier · Open slots · Priority</td><td>Pins linked to applications by pin code.</td></tr>
    <tr><td><b>3 · Existing stores</b></td><td>Store ID · City · Pin code · Opened (year)</td><td>Fixed 10 stores, built in if the sheet is absent.</td></tr>
  </tbody></table>
</section>

<section class="sec">
  <div class="sec-h"><span>[04] Reading messy data</span><span>Normalise · check · fill</span></div>
  <h2>Messy cells are read, not rejected.</h2>
  <table class="t small"><thead><tr><th>Column</th><th>Examples accepted</th><th>Read as</th></tr></thead><tbody>
    <tr><td>IDs</td><td>“app 7”, “APP_07”, “ter1”</td><td>APP-007, TER-01 (chat uses the same rule)</td></tr>
    <tr><td>Names</td><td>“  RAVI   KUMAR ”, “N/A”, “test”</td><td>Ravi Kumar; placeholders → blank</td></tr>
    <tr><td>City</td><td>“Mysore”, “B'lore”, “Tumkur”, “ಮೈಸೂರು”, pin inside the city cell</td><td>Canonical city; pin extracted</td></tr>
    <tr><td>Investment</td><td>“Rs 25,00,000”, “1.2 cr”, “30-35”, “15 lakh”, “approx 40”, 0</td><td>₹25L · ₹120L · ₹30L (lower end) · ₹15L · ₹40L · missing</td></tr>
    <tr><td>Experience</td><td>“8+”, “fresher”, “6 months”, “two”</td><td>8 · 0 · 0.5 · 2</td></tr>
    <tr><td>Space</td><td>“Yes - rented”, “own building (not mortgaged)”, “Rented (owner is my uncle)”, “looking for a shop”, “Yes”</td><td>Rented · Owned · Rented · Not yet identified · Hold (owned or rented?)</td></tr>
    <tr><td>Floor</td><td>“GF”, “first floor ok”, “basement”, “Mall”</td><td>Ground · Upper · Upper (low visibility) · Mall unit</td></tr>
    <tr><td>Target launch</td><td>“ASAP”, “Jan 2027”, “before Diwali”, “1 year”, 0</td><td>1 · months to Jan · 1 (8 Nov 2026) · 12 · 1</td></tr>
    <tr><td>Language</td><td>“Kannada / English”, “ಕನ್ನಡ”, “Telugu”</td><td>Kannada (first listed) · Kannada · English default + warning</td></tr>
    <tr><td>Pins (Sheet 2)</td><td>“570 001 &amp; 570002 / 570008”, “572101-03”</td><td>570001, 570002, 570008 · 572101–572103</td></tr>
    <tr><td>Tier / priority / slots</td><td>“Tier-II”, “T3” · “P1”, “HIGH!!”, “med” · “two”, “2 slots”</td><td>Tier 2, Tier 3 · High, High, Medium · 2, 2</td></tr>
  </tbody></table>
  <h3>Values read from the notes</h3>
  <p>If a cell is blank but the applicant's own text states it (“our 520 sq ft ground-floor shop”, “can invest 22 lakh”), the value is used, marked “from notes”, and a single condition asks the team to confirm it before signing.</p>
  <h3>Data checks</h3>
  <table class="t small"><thead><tr><th>Check</th><th>Effect</th></tr></thead><tbody>
    <tr><td>Investment blank or 0; space status blank or “Yes”; pin missing or not 6 digits</td><td>{pill('Hold')} Needs information</td></tr>
    <tr><td>City and pin disagree (Mysuru with 560xxx)</td><td>{pill('Hold')} with the exact question; never rejected on a location the applicant may not mean</td></tr>
    <tr><td>Notes contradict the form (“still looking for a shop” while Space = Owned)</td><td>{pill('Hold')} Needs clarification, quoting the notes. Softer conflicts read by the AI become a “confirm” condition.</td></tr>
    <tr><td>Same name and pin as another row</td><td>{pill('Hold')} Duplicate — merge first; never given a second slot</td></tr>
    <tr><td>No space but size/floor filled</td><td>Treated as not identified; floor read as a preference only</td></tr>
    <tr><td>Space owned/rented but size blank</td><td>Condition: confirm the carpet area</td></tr>
    <tr><td>Territory: pin in two territories · tier contradicts allowed values · slots more than free pins · pin in wrong city</td><td>Counted once for the higher priority · official tier used · slots capped · flagged</td></tr>
    <tr><td>Fields corrected later by the team</td><td>Older notes can no longer contradict them</td></tr>
  </tbody></table>
</section>

<section class="sec">
  <div class="sec-h"><span>[05] Decision pipeline — step by step</span><span>Fig. 02</span></div>
  <div class="fig flowfig">{pipeline()}</div>
  <p class="figcap">Fig. 02 · The order the engine runs in. Grey steps are deterministic code; the blue step uses AI with a rule-based fallback. Outcomes on the right end the path for that application.</p>
  <h3>Phase 1 territory gate</h3>
  <p><b>Scenario A — strict.</b> If at least one application in the batch is in a preferred territory, only in-territory applications go on to slots; the others are held on the waitlist as “outside the expansion area” (they still get a score so the team can see latent demand).<br/><b>Scenario B — fallback.</b> If none are, nobody is held back: every application continues with the flag “Not a preferred location for company”, a strategic-fit score of 2/10, and a condition that the team must open a territory.</p>
  <h3>Knockouts (in this order)</h3>
  <ol>{gates_html}</ol>
</section>

<section class="sec">
  <div class="sec-h"><span>[06] Scoring rubric</span><span>Rubric v{R['version']} · 100 points</span></div>
  <h2>Five dimensions, thirteen metrics.</h2>
  <p class="lead">Each metric is scored 0–10. Partner fit (7 metrics) and location fit (6 metrics) are each weighted to 100 and blended {R['blend']['partner']}/{R['blend']['location']}. The result is shown as five dimensions so the reason is easy to read.</p>
  <table class="t"><thead><tr><th>Dimension</th><th>Question it answers</th><th>Metrics</th><th>Points</th></tr></thead><tbody>{dims_rows}</tbody></table>
  <div class="callout"><b>Formula.</b> Partner score = Σ (metric score / 10 × partner weight). Location score = Σ (metric score / 10 × location weight). Final = {R['blend']['partner']}% × partner + {R['blend']['location']}% × location. If the brand runs the store (FOCO), half the operating-experience weight moves to financial readiness.</div>
  {metric_tables()}
</section>

<section class="sec">
  <div class="sec-h"><span>[07] From score to decision</span><span>Bands · conditions</span></div>
  <h2>How a score becomes a decision.</h2>
  <table class="t"><thead><tr><th>Line</th><th>Value</th><th>Meaning</th></tr></thead><tbody>
    <tr><td>Approve bar (tier minimum)</td><td class="n">T1 {R['approveMin']['Tier 1']} · T2 {R['approveMin']['Tier 2']} · T3 {R['approveMin']['Tier 3']}</td><td>Needed for a clean Approve; a slot holder below it is Conditional with a 90-day review.</td></tr>
    <tr><td>Slot-eligible from</td><td class="n">{R['conditionalMin']}</td><td>Can compete for a slot.</td></tr>
    <tr><td>Review band</td><td class="n">{R['rejectBelow']}–{R['conditionalMin']}</td><td>Hold for a human look.</td></tr>
    <tr><td>Reject below</td><td class="n">{R['rejectBelow']}</td><td>Too weak to proceed.</td></tr>
    <tr><td>Capital floor</td><td class="n">{int(R['capitalFloor']*100)}%</td><td>Investment under this share of the tier minimum is rejected before scoring.</td></tr>
    <tr><td>Cannibalisation radius</td><td class="n">{R['saturationKm']} km</td><td>Own store closer than this scores 2/10 on competition.</td></tr>
  </tbody></table>
  <h3>Final decision</h3>
  <table class="t"><tbody>
    <tr><td style="width:24%">{pill('Approve')}</td><td>Won a slot, score ≥ tier bar, no conditions open.</td></tr>
    <tr><td>{pill('Conditional')}</td><td>Won a slot but has conditions. <b>Cap rule:</b> no space identified caps the decision at Conditional (“Score 72 would be Approve, but no space is identified yet”). The slot is reserved for 60 days and the next in line is named.</td></tr>
    <tr><td>{pill('Hold')}</td><td>Waitlisted behind higher scores, lost the pin with no free pin left, outside the plan, review band, missing or conflicting data, legal risk, duplicate, or 3+ major gaps.</td></tr>
    <tr><td>{pill('Reject')}</td><td>Failed a knockout or scored below {R['rejectBelow']}.</td></tr>
  </tbody></table>
  <h3>Conditions the engine can attach</h3>
  <table class="t small tight"><thead><tr><th>Condition</th><th>Trigger</th><th>Major gap?</th><th>Due</th></tr></thead><tbody>
    <tr><td>Secure a ground-floor {B['sqft']['idealMin']}–{B['sqft']['idealMax']} sq ft space in the pin</td><td>No space yet</td><td>yes</td><td class="n">60 days</td></tr>
    <tr><td>Close a funding gap (sanction letter or co-investor)</td><td>Capital {int(R['capitalFloor']*100)}–100% of minimum</td><td>yes</td><td class="n">30 days</td></tr>
    <tr><td>Move to a ground-floor or mall unit</td><td>Upper floor when walk-ins matter</td><td>yes</td><td class="n">45 days</td></tr>
    <tr><td>Find a right-sized space / get format sign-off</td><td>Far outside / slightly outside the size range</td><td>yes / no</td><td class="n">45 / 14 days</td></tr>
    <tr><td>Relocate to free pin X</td><td>Lost own pin but outranks the territory</td><td>no</td><td class="n">30 days</td></tr>
    <tr><td>Reset the launch to month N</td><td>Faster than the realistic lead time</td><td>no</td><td class="n">3 days</td></tr>
    <tr><td>Name a full-time store manager</td><td>Owner not hands-on (from notes)</td><td>no</td><td class="n">21 days</td></tr>
    <tr><td>Needs a running shop</td><td>Shop-in-shop / micro model without one</td><td>yes</td><td class="n">21 days</td></tr>
    <tr><td>Confirm size / notes / conflict</td><td>Missing size, values read from notes, soft AI conflict</td><td>no</td><td class="n">7 days</td></tr>
    <tr><td>Team must open a territory</td><td>Scenario B fallback</td><td>no</td><td class="n">21 days</td></tr>
    <tr><td>90-day performance review</td><td>Slot holder below the tier bar</td><td>no</td><td class="n">after opening</td></tr>
  </tbody></table>
</section>

<section class="sec">
  <div class="sec-h"><span>[08] Allocation</span><span>Fig. 03</span></div>
  <h2>One store per pin; the best partners win the slots.</h2>
  <ol>
    <li><b>Usable slots</b> per territory = min(open slots, pins without an existing store). A pin listed in two territories counts for the higher-priority one.</li>
    <li><b>Pin contest.</b> Among eligible applications on the same pin, the best score keeps it.</li>
    <li><b>Relocation.</b> Each runner-up is re-scored on every free pin of its territory (preferring pins no one else asked for). If its best re-score still clears {R['conditionalMin']}, it joins the slot race with a “relocate” condition.</li>
    <li><b>Slot race.</b> Pin holders and relocated runners-up are ranked by score; tie-break capital → site readiness → sooner launch → lower ID. The top N take the N usable slots; the rest are waitlisted with their rank, and the first is named “next in line” on the slot holders.</li>
    <li><b>Proximity check.</b> Two new stores closer than {R['saturationKm']} km get a catchment-overlap flag.</li>
  </ol>
  <div class="fig big">{allocation()}</div>
  <p class="figcap">Fig. 03 · Real allocation from the sample batch, territory TER-03 Mysuru.</p>
</section>

<section class="sec">
  <div class="sec-h"><span>[09] Outputs</span><span>Per partner</span></div>
  <h2>What every partner gets.</h2>
  <table class="t"><tbody>
    <tr><td style="width:28%"><b>Decision &amp; headline</b></td><td>One status and a one-sentence reason (slot, rival, bar, cap).</td></tr>
    <tr><td><b>Five dimension scores</b></td><td>Plus all 13 metric scores with the evidence the engine recorded.</td></tr>
    <tr><td><b>Conditions</b></td><td>What must close before signing, with due dates.</td></tr>
    <tr><td><b>Path to yes</b></td><td>Single changes (and the combination) simulated against the whole batch — rivals included — showing the decision each would produce.</td></tr>
    <tr><td><b>Open pins nearby</b></td><td>For anyone without a slot: free pins in the same city that still have capacity.</td></tr>
    <tr><td><b>Explanation &amp; partner message</b></td><td>AI-written plain-language reason for the team; a message to the partner in Kannada, Hindi or English. Template text from the scores if AI is unavailable.</td></tr>
    <tr><td><b>Onboarding plan</b></td><td>Dated steps in four phases (Before signing · Set up · Train · Open), owner per step, training at the nearest existing store, translated into the partner's language.</td></tr>
    <tr><td><b>Indicative payback</b></td><td>Setup cost ÷ (tier revenue benchmark × margin, + rent saved if owned).</td></tr>
    <tr><td><b>Interview checklist</b></td><td>Not in the data and not scored: proof of funds, credit, people management, local knowledge, brand fit, coachability.</td></tr>
  </tbody></table>
  <h3>Plan timing rules</h3>
  <p>Offer letter day 5 · KYC day 10 · site audit day 14 (or site found by day 60 if no space) · agreement 7 days later · fit-out 5 weeks (≤600 sq ft), 7 (≤1,200) or 9 weeks · licences agreement + 21 days · hire {B['staff']} staff 3 weeks before handover · owner training {sum(t['days'] for t in B['training'])} days at the nearest store · soft launch 2 days after fit-out · grand opening on the target date if feasible, otherwise a week after soft launch · 30-day review with a “ready to run alone” sign-off · 90-day review. A festival deadline (e.g. Diwali, 8 Nov 2026) is checked against the plan.</p>
  <h3>Example: APP-016 (Approve, Davanagere)</h3>
  {plan_table()}
</section>

<section class="sec">
  <div class="sec-h"><span>[10] Feedback and improve loops</span><span>Fig. 04</span></div>
  <h2>Ask why. Say what changed. See who moves.</h2>
  <div class="fig big">{feedback()}</div>
  <p class="figcap">Fig. 04 · The chat loop (top) and the improve loop (bottom). Orange boxes are decision gates: nothing changes until the team confirms.</p>
  <ul>
    <li><b>Event-sourced data.</b> The uploaded file is never modified; every change is an edit on top of it, so any decision can be traced to the exact facts that produced it, and any change can be undone.</li>
    <li><b>Whole-batch re-runs.</b> One update can change rivals' decisions (e.g. a withdrawal frees a slot and the next in line moves up); the preview shows those knock-on changes before Apply.</li>
    <li><b>Upgrades from Reject</b> are tagged “team to confirm”.</li>
    <li><b>Rubric versions.</b> The pattern finder proposes changes of at most 5 points per weight, says when evidence is thin (&lt; 5 recorded outcomes), and keeps each group at 100. The team previews the impact on the current batch and approves version N+1.</li>
  </ul>
</section>

<section class="sec">
  <div class="sec-h"><span>[11] Where AI is used</span><span>Boundaries</span></div>
  <h2>The AI reads and writes. It never decides.</h2>
  <table class="t small"><thead><tr><th>Job</th><th>Model</th><th>Can it change a score?</th><th>If it fails</th></tr></thead><tbody>
    <tr><td>Tag free text (relevance, urgency, red flags, contradictions, values for blank cells)</td><td>Gemini 3.6 Flash, temperature 0</td><td>Indirectly, via tags; a keyword match on the brand's own trade is a floor; AI flags can only Hold, never Reject</td><td>Rule-based reader</td></tr>
    <tr><td>Place unmapped pin codes</td><td>Gemini 3.6 Flash</td><td>Locality type only, labelled “AI estimate”; coordinates rejected if outside the city</td><td>Built-in map / city baseline</td></tr>
    <tr><td>Custom brand profile (“Other”)</td><td>Gemini 3.7 Flash</td><td>Sets numbers the team reviews before upload; values clamped</td><td>Closest preset</td></tr>
    <tr><td>Explain a decision; partner message; translate the plan</td><td>Gemini 3.7 / 3.6 Flash</td><td>No — told the numbers are final</td><td>Template from the scores</td></tr>
    <tr><td>Chat: answer “why”, turn facts into edits, detect overrides</td><td>Gemini 3.7 Flash</td><td>No — edits go back through validation and the engine; team confirms</td><td>Rule-based chat</td></tr>
    <tr><td>Pattern finder</td><td>Gemini 3.7 Flash</td><td>No — produces a draft rubric for approval</td><td>Unavailable message</td></tr>
  </tbody></table>
  <p>Every call is JSON-only with a hard timeout and falls through three models (3.7 Flash → 3.6 Flash → 3.5 Flash-Lite). The key lives on the server only.</p>
</section>

<section class="sec">
  <div class="sec-h"><span>[12] Worked example</span><span>Sample batch</span></div>
  <h2>One partner, end to end.</h2>
  {worked()}
  <h3>The whole sample batch</h3>
  {batch_table()}
</section>

<section class="sec">
  <div class="sec-h"><span>[13] Assumptions and limits</span><span>Read before deciding</span></div>
  <h2>What the numbers rest on.</h2>
  <ul>
    <li><b>Tier minimums and space ranges</b> are benchmarks (eyewear: Lenskart's published ~₹35L regular / ~₹20L “Lite” formats, 250–600 sq ft), not given in the case. The team can tune them before upload.</li>
    <li><b>Score cut-offs</b> (tier bars {R['approveMin']['Tier 1']}/{R['approveMin']['Tier 2']}/{R['approveMin']['Tier 3']}, review band {R['rejectBelow']}–{R['conditionalMin']}) are starting values to be tuned against which partners actually open and pay back.</li>
    <li><b>No store performance data.</b> Sheet 3 has no sales or payback, so existing stores are assumed healthy; payback is a category benchmark.</li>
    <li><b>No geography below pin code.</b> About 60 well-known pins are on a built-in locality map; others use an AI estimate or the city baseline. Distances are approximate.</li>
    <li><b>Competition</b> means cannibalisation of the brand's own stores and white space; no competitor data is uploaded.</li>
    <li><b>Preferred language</b> counts in “local nuance” (10% of partner fit), following the team's applicant rubric.</li>
    <li><b>Financial strength beyond stated investment</b> and traits like coachability are checked in the interview, not scored.</li>
  </ul>
  <p class="mono" style="margin-top:30px">Outpost · generated from the live engine on 25 Oct 2026 · rubric v{R['version']} · {esc(B['industry'])} · FOFO</p>
</section>
</body></html>"""

(ROOT / "criteria.html").write_text(HTML)
print("wrote", ROOT / "criteria.html", len(HTML))
