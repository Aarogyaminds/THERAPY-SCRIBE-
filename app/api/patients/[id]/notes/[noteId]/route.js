import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(req, { params }) {
  const { id, noteId } = await params;
  const { text } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: "Note text required" }, { status: 400 });

  const db = supabaseAdmin();
  const { error } = await db.from("notes").update({ text: text.trim() }).eq("id", noteId).eq("patient_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req, { params }) {
  const { id, noteId } = await params;
  const db = supabaseAdmin();
  const { error } = await db.from("notes").delete().eq("id", noteId).eq("patient_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
