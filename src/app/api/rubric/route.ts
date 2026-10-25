import { db, dbConfigured } from "@/lib/db";
import { rubricTotalOk } from "@/lib/engine/rubric";
import type { Rubric } from "@/lib/engine/types";

// Versioned rubric. The next upload always reads the latest approved version.

export async function GET() {
  if (!dbConfigured()) return Response.json({ versions: [] });
  try {
    const r = await (await db()).query(`select version, created_at, note, rubric from rubric_versions order by version desc limit 20`);
    return Response.json({ versions: r.rows.map((x) => ({ ...x.rubric, version: x.version, note: x.note, createdAt: x.created_at })) });
  } catch (e) {
    return Response.json({ versions: [], error: String(e) });
  }
}

export async function POST(req: Request) {
  const { rubric } = (await req.json()) as { rubric: Rubric };
  const bad = rubricTotalOk(rubric);
  if (bad) return Response.json({ error: bad }, { status: 400 });
  if (!dbConfigured()) return Response.json({ saved: false, version: rubric.version });
  try {
    const p = await db();
    const cur = await p.query(`select coalesce(max(version), 1) as v from rubric_versions`);
    const version = Math.max(Number(cur.rows[0].v) + 1, rubric.version);
    await p.query(`insert into rubric_versions (version, note, rubric) values ($1,$2,$3)`, [version, rubric.note, JSON.stringify({ ...rubric, version })]);
    return Response.json({ saved: true, version });
  } catch (e) {
    return Response.json({ saved: false, error: String(e) }, { status: 500 });
  }
}
