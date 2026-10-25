import "server-only";
import { Pool } from "pg";

// Optional Postgres. Without DATABASE_URL the app still works fully; batches
// then live only in the visitor's browser.

let pool: Pool | null = null;
let ready: Promise<void> | null = null;

export function dbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

export async function db(): Promise<Pool> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  ready ??= pool
    .query(
      `create table if not exists batches (
         id text primary key,
         created_at timestamptz not null default now(),
         updated_at timestamptz not null default now(),
         file_name text,
         brand jsonb,
         rubric_version int,
         summary jsonb,
         results jsonb,
         territories jsonb,
         change_log jsonb
       );
       create table if not exists rubric_versions (
         version int primary key,
         created_at timestamptz not null default now(),
         note text,
         rubric jsonb not null
       );
       create table if not exists outcomes (
         batch_id text not null,
         app_id text not null,
         opened boolean,
         on_time boolean,
         payback_months numeric,
         note text,
         recorded_at timestamptz not null default now(),
         primary key (batch_id, app_id)
       );`,
    )
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  await ready;
  return pool;
}
