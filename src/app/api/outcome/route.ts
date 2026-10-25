import { db, dbConfigured } from "@/lib/db";

// What actually happened to an approved partner: opened? on time? payback?
// These rows feed the pattern finder.

export async function POST(req: Request) {
  const o = await req.json();
  if (!dbConfigured()) return Response.json({ saved: false });
  try {
    await (await db()).query(
      `insert into outcomes (batch_id, app_id, opened, on_time, payback_months, note) values ($1,$2,$3,$4,$5,$6)
       on conflict (batch_id, app_id) do update set opened = excluded.opened, on_time = excluded.on_time,
         payback_months = excluded.payback_months, note = excluded.note, recorded_at = now()`,
      [o.batchId, o.appId, o.opened, o.onTime, o.paybackMonths ?? null, o.note ?? null],
    );
    return Response.json({ saved: true });
  } catch (e) {
    return Response.json({ saved: false, error: String(e) }, { status: 500 });
  }
}
