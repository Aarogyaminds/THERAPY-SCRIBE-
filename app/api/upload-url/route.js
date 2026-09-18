import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Issues a short-lived signed upload URL so the browser can PUT the raw session
// audio directly into Storage, bypassing this server entirely — Vercel serverless
// functions cap request bodies at 4.5MB, far too small for a 45-60min recording.
export async function POST(req) {
  const { patientId, ext } = await req.json();
  if (!patientId) return NextResponse.json({ error: "patientId required" }, { status: 400 });

  const path = `${patientId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext || "webm"}`;
  const db = supabaseAdmin();
  const { data, error } = await db.storage.from("session-audio").createSignedUploadUrl(path);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ path: data.path, token: data.token });
}
