import { db, dbConfigured } from "@/lib/db";

// Saves each batch (decisions, score breakdowns, change log) so Insights can
// look across every upload, and so the Q&A has a durable record.

export async function POST(req: Request) {
  if (!dbConfigured()) return Response.json({ saved: false, reason: "no database" });
  const b = await req.json();
  try {
    await (await db()).query(
      `insert into batches (id, file_name, brand, rubric_version, summary, results, territories, change_log)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (id) do update set updated_at = now(), file_name = excluded.file_name, brand = excluded.brand,
         rubric_version = excluded.rubric_version, summary = excluded.summary, results = excluded.results,
         territories = excluded.territories, change_log = excluded.change_log`,
      [b.id, b.fileName, JSON.stringify(b.brand), b.rubricVersion, JSON.stringify(b.summary), JSON.stringify(b.results), JSON.stringify(b.territories), JSON.stringify(b.changeLog ?? [])],
    );
    return Response.json({ saved: true });
  } catch (e) {
    return Response.json({ saved: false, reason: String(e) }, { status: 500 });
  }
}

export async function GET() {
  if (!dbConfigured()) return Response.json({ batches: [], outcomes: [], db: false });
  try {
    const p = await db();
    const batches = await p.query(`select id, created_at, updated_at, file_name, brand, rubric_version, summary, results, territories from batches order by created_at desc limit 50`);
    const outcomes = await p.query(`select batch_id, app_id, opened, on_time, payback_months::float as payback_months, note, recorded_at from outcomes`);
    return Response.json({ batches: batches.rows, outcomes: outcomes.rows, db: true });
  } catch (e) {
    return Response.json({ batches: [], outcomes: [], db: false, error: String(e) });
  }
}
