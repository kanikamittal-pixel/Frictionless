import { aiConfigured } from "@/lib/ai/openrouter";
import { dbConfigured, db } from "@/lib/db";

export async function GET() {
  let database = false;
  if (dbConfigured()) {
    try {
      await (await db()).query("select 1");
      database = true;
    } catch {}
  }
  return Response.json({ ai: aiConfigured(), db: database });
}
