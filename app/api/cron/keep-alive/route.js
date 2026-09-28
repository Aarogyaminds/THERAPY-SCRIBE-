import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Supabase's free tier pauses a project after 7 days with no database activity.
// Vercel Cron hits this every 6 days with one trivial read — no writes, so it
// never grows storage — just to keep the project from ever going to sleep.
// Vercel automatically sends "Authorization: Bearer <CRON_SECRET>" on cron
// invocations when CRON_SECRET is set as an env var; that's checked below
// instead of the app's own login, since a cron job can't hold a session cookie.
export async function GET(req) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { error } = await db.from("patients").select("id").limit(1);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, pingedAt: new Date().toISOString() });
}
