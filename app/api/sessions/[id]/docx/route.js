import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// The docx bucket is private; hand back a short-lived signed URL rather than
// exposing the service-role key or making the bucket public.
export async function GET(_req, { params }) {
  const { id } = await params;
  const db = supabaseAdmin();
  const { data: session, error } = await db.from("sessions").select("docx_path").eq("id", id).single();
  if (error || !session?.docx_path) return NextResponse.json({ error: "No file for this session" }, { status: 404 });

  const { data, error: signErr } = await db.storage.from("session-docs").createSignedUrl(session.docx_path, 60);
  if (signErr) return NextResponse.json({ error: signErr.message }, { status: 500 });

  return NextResponse.redirect(data.signedUrl);
}
